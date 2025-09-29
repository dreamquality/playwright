/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Locator } from './locator';
import { Frame } from './frame';
import { asLocators } from '../utils/isomorphic/locatorGenerators';
import { parseSelector } from '../utils/isomorphic/selectorParser';
import { getByRoleSelector, getByTextSelector, getByTestIdSelector } from '../utils/isomorphic/locatorUtils';

export interface HealingConfig {
  enabled: boolean;
  maxRetries: number;
  strategies: HealingStrategy[];
  fallbackOrder: ('role' | 'text' | 'css' | 'xpath' | 'testid' | 'aria')[];
  uniquenessThreshold: number;
  stabilityChecks: number;
  debugMode: boolean;
  logLevel: 'none' | 'basic' | 'verbose';
  screenshotOnHealing: boolean;
  customStrategies?: CustomHealingStrategy[];
}

export interface HealingStrategy {
  name: string;
  enabled: boolean;
  priority: number;
  options?: Record<string, any>;
}

export interface CustomHealingStrategy {
  name: string;
  generate: (element: Element, frame: Frame) => Promise<string[]>;
  validate?: (selector: string, frame: Frame) => Promise<boolean>;
}

export interface HealingAttempt {
  originalSelector: string;
  candidateSelectors: CandidateSelector[];
  timestamp: number;
  success: boolean;
  strategy: string;
  finalSelector?: string;
  screenshots?: string[];
  errorMessage?: string;
}

export interface CandidateSelector {
  selector: string;
  strategy: string;
  confidence: number;
  isUnique: boolean;
  isStable: boolean;
  elementPreview: string;
}

const DEFAULT_HEALING_CONFIG: HealingConfig = {
  enabled: true,
  maxRetries: 3,
  strategies: [
    { name: 'role', enabled: true, priority: 1 },
    { name: 'text', enabled: true, priority: 2 },
    { name: 'css', enabled: true, priority: 3 },
    { name: 'xpath', enabled: true, priority: 4 },
    { name: 'testid', enabled: true, priority: 5 },
    { name: 'aria', enabled: true, priority: 6 }
  ],
  fallbackOrder: ['role', 'text', 'testid', 'css', 'xpath', 'aria'],
  uniquenessThreshold: 1,
  stabilityChecks: 2,
  debugMode: !!process.env.PW_HEALING_DEBUG,
  logLevel: process.env.PW_HEALING_DEBUG ? 'verbose' : 'basic',
  screenshotOnHealing: true
};

export class HealingManager {
  private _config: HealingConfig;
  private _attempts: HealingAttempt[] = [];

  constructor(config?: Partial<HealingConfig>) {
    this._config = { ...DEFAULT_HEALING_CONFIG, ...config };
  }

  updateConfig(config: Partial<HealingConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): HealingConfig {
    return { ...this._config };
  }

  async healLocator(frame: Frame, originalSelector: string): Promise<{ selector: string; attempt: HealingAttempt } | null> {
    if (!this._config.enabled) {
      return null;
    }

    const attempt: HealingAttempt = {
      originalSelector,
      candidateSelectors: [],
      timestamp: Date.now(),
      success: false,
      strategy: 'none'
    };

    try {
      // Try to get element with original selector first
      const elements = await frame.$$(originalSelector);
      if (elements.length > 0) {
        // Original selector still works
        elements.forEach(el => el.dispose());
        return null;
      }

      // Generate candidate selectors
      const candidates = await this._generateCandidateSelectors(frame, originalSelector);
      attempt.candidateSelectors = candidates;

      // Validate and rank candidates
      const validCandidates = await this._validateCandidates(frame, candidates);

      if (validCandidates.length === 0) {
        attempt.errorMessage = 'No valid candidate selectors found';
        this._attempts.push(attempt);
        return null;
      }

      // Select best candidate
      const bestCandidate = this._selectBestCandidate(validCandidates);
      attempt.success = true;
      attempt.strategy = bestCandidate.strategy;
      attempt.finalSelector = bestCandidate.selector;

      this._attempts.push(attempt);

      if (this._config.logLevel !== 'none') {
        console.log(`[Playwright Healing] Healed selector: ${originalSelector} → ${bestCandidate.selector} (strategy: ${bestCandidate.strategy})`);
      }

      return {
        selector: bestCandidate.selector,
        attempt
      };

    } catch (error) {
      attempt.errorMessage = error instanceof Error ? error.message : String(error);
      this._attempts.push(attempt);
      return null;
    }
  }

  private async _generateCandidateSelectors(frame: Frame, originalSelector: string): Promise<CandidateSelector[]> {
    const candidates: CandidateSelector[] = [];
    
    // First, try to find elements using broader strategies
    try {
      // Extract potential text content and attributes from the original selector
      const { textContent, attributes } = this._extractSelectorInfo(originalSelector);
      
      for (const strategy of this._config.strategies.filter(s => s.enabled).sort((a, b) => a.priority - b.priority)) {
        const strategyCandidates = await this._generateByStrategy(frame, strategy.name, { textContent, attributes });
        candidates.push(...strategyCandidates);
      }

      // Apply custom strategies if any
      if (this._config.customStrategies) {
        for (const customStrategy of this._config.customStrategies) {
          try {
            const customSelectors = await customStrategy.generate(document.documentElement, frame);
            candidates.push(...customSelectors.map(selector => ({
              selector,
              strategy: customStrategy.name,
              confidence: 0.5,
              isUnique: false,
              isStable: false,
              elementPreview: ''
            })));
          } catch (error) {
            // Log custom strategy error but continue
            if (this._config.logLevel === 'verbose') {
              console.warn(`[Playwright Healing] Custom strategy ${customStrategy.name} failed:`, error);
            }
          }
        }
      }

    } catch (error) {
      if (this._config.logLevel === 'verbose') {
        console.warn('[Playwright Healing] Error generating candidates:', error);
      }
    }

    return candidates;
  }

  private _extractSelectorInfo(selector: string): { textContent: string[], attributes: Record<string, string> } {
    const textContent: string[] = [];
    const attributes: Record<string, string> = {};

    // Extract text content from text selectors
    const textMatches = selector.match(/text=["']([^"']+)["']/g);
    if (textMatches) {
      textMatches.forEach(match => {
        const text = match.match(/text=["']([^"']+)["']/)?.[1];
        if (text) textContent.push(text);
      });
    }

    // Extract test-id attributes
    const testIdMatches = selector.match(/\[data-testid=["']([^"']+)["']\]/g);
    if (testIdMatches) {
      testIdMatches.forEach(match => {
        const testId = match.match(/\[data-testid=["']([^"']+)["']\]/)?.[1];
        if (testId) attributes['data-testid'] = testId;
      });
    }

    return { textContent, attributes };
  }

  private async _generateByStrategy(frame: Frame, strategy: string, info: { textContent: string[], attributes: Record<string, string> }): Promise<CandidateSelector[]> {
    const candidates: CandidateSelector[] = [];

    try {
      switch (strategy) {
        case 'role':
          candidates.push(...await this._generateRoleSelectors(frame, info));
          break;
        case 'text':
          candidates.push(...await this._generateTextSelectors(frame, info));
          break;
        case 'testid':
          candidates.push(...await this._generateTestIdSelectors(frame, info));
          break;
        case 'css':
          candidates.push(...await this._generateCssSelectors(frame, info));
          break;
        case 'xpath':
          candidates.push(...await this._generateXPathSelectors(frame, info));
          break;
        case 'aria':
          candidates.push(...await this._generateAriaSelectors(frame, info));
          break;
      }
    } catch (error) {
      if (this._config.logLevel === 'verbose') {
        console.warn(`[Playwright Healing] Strategy ${strategy} failed:`, error);
      }
    }

    return candidates;
  }

  private async _generateRoleSelectors(frame: Frame, info: { textContent: string[], attributes: Record<string, string> }): Promise<CandidateSelector[]> {
    const candidates: CandidateSelector[] = [];
    const commonRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option', 'tab', 'tabpanel'];

    for (const role of commonRoles) {
      const selector = getByRoleSelector(role);
      candidates.push({
        selector,
        strategy: 'role',
        confidence: 0.7,
        isUnique: false,
        isStable: false,
        elementPreview: `role=${role}`
      });

      // Combine with text if available
      for (const text of info.textContent) {
        const selectorWithText = getByRoleSelector(role, { name: text });
        candidates.push({
          selector: selectorWithText,
          strategy: 'role',
          confidence: 0.9,
          isUnique: false,
          isStable: false,
          elementPreview: `role=${role} name="${text}"`
        });
      }
    }

    return candidates;
  }

  private async _generateTextSelectors(frame: Frame, info: { textContent: string[], attributes: Record<string, string> }): Promise<CandidateSelector[]> {
    const candidates: CandidateSelector[] = [];

    for (const text of info.textContent) {
      const exactSelector = getByTextSelector(text, { exact: true });
      const partialSelector = getByTextSelector(text, { exact: false });

      candidates.push({
        selector: exactSelector,
        strategy: 'text',
        confidence: 0.8,
        isUnique: false,
        isStable: false,
        elementPreview: `text="${text}" (exact)`
      });

      candidates.push({
        selector: partialSelector,
        strategy: 'text',
        confidence: 0.6,
        isUnique: false,
        isStable: false,
        elementPreview: `text="${text}" (partial)`
      });
    }

    return candidates;
  }

  private async _generateTestIdSelectors(frame: Frame, info: { textContent: string[], attributes: Record<string, string> }): Promise<CandidateSelector[]> {
    const candidates: CandidateSelector[] = [];

    if (info.attributes['data-testid']) {
      const selector = getByTestIdSelector('data-testid', info.attributes['data-testid']);
      candidates.push({
        selector,
        strategy: 'testid',
        confidence: 0.95,
        isUnique: false,
        isStable: false,
        elementPreview: `data-testid="${info.attributes['data-testid']}"`
      });
    }

    return candidates;
  }

  private async _generateCssSelectors(frame: Frame, info: { textContent: string[], attributes: Record<string, string> }): Promise<CandidateSelector[]> {
    const candidates: CandidateSelector[] = [];
    
    // Generate generic CSS selectors for common patterns
    const commonSelectors = [
      'button',
      'input[type="button"]',
      'input[type="submit"]',
      'a',
      'input[type="text"]',
      'input[type="email"]',
      'input[type="password"]',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '.button',
      '.btn',
      '.link'
    ];

    for (const selector of commonSelectors) {
      candidates.push({
        selector,
        strategy: 'css',
        confidence: 0.4,
        isUnique: false,
        isStable: false,
        elementPreview: selector
      });
    }

    return candidates;
  }

  private async _generateXPathSelectors(frame: Frame, info: { textContent: string[], attributes: Record<string, string> }): Promise<CandidateSelector[]> {
    const candidates: CandidateSelector[] = [];

    for (const text of info.textContent) {
      const exactXPath = `//text()[normalize-space()="${text}"]/parent::*`;
      const partialXPath = `//text()[contains(normalize-space(), "${text}")]/parent::*`;

      candidates.push({
        selector: exactXPath,
        strategy: 'xpath',
        confidence: 0.7,
        isUnique: false,
        isStable: false,
        elementPreview: `XPath with text "${text}"`
      });

      candidates.push({
        selector: partialXPath,
        strategy: 'xpath',
        confidence: 0.5,
        isUnique: false,
        isStable: false,
        elementPreview: `XPath contains text "${text}"`
      });
    }

    return candidates;
  }

  private async _generateAriaSelectors(frame: Frame, info: { textContent: string[], attributes: Record<string, string> }): Promise<CandidateSelector[]> {
    const candidates: CandidateSelector[] = [];

    // Generate ARIA-based selectors
    const ariaSelectors = [
      '[aria-label]',
      '[aria-labelledby]',
      '[aria-describedby]',
      '[aria-expanded]',
      '[aria-selected]',
      '[aria-checked]'
    ];

    for (const selector of ariaSelectors) {
      candidates.push({
        selector,
        strategy: 'aria',
        confidence: 0.6,
        isUnique: false,
        isStable: false,
        elementPreview: selector
      });
    }

    return candidates;
  }

  private async _validateCandidates(frame: Frame, candidates: CandidateSelector[]): Promise<CandidateSelector[]> {
    const validCandidates: CandidateSelector[] = [];

    for (const candidate of candidates) {
      try {
        const elements = await frame.$$(candidate.selector);
        
        // Check uniqueness
        candidate.isUnique = elements.length === this._config.uniquenessThreshold;
        
        if (elements.length > 0) {
          // Get element preview
          if (elements.length > 0) {
            try {
              candidate.elementPreview = await elements[0].evaluate(el => {
                const tag = el.tagName.toLowerCase();
                const text = el.textContent?.trim().slice(0, 50) || '';
                const id = el.id ? `#${el.id}` : '';
                const className = el.className ? `.${el.className.split(' ').join('.')}` : '';
                return `<${tag}${id}${className}>${text}`;
              });
            } catch (error) {
              // Ignore preview errors
            }
          }

          // Check stability (simplified - in real implementation, would check multiple times)
          candidate.isStable = true; // For now, assume stable if found

          validCandidates.push(candidate);
        }

        // Clean up element handles
        elements.forEach(el => el.dispose());

      } catch (error) {
        // Selector is invalid or caused an error
        if (this._config.logLevel === 'verbose') {
          console.warn(`[Playwright Healing] Invalid candidate ${candidate.selector}:`, error);
        }
      }
    }

    return validCandidates;
  }

  private _selectBestCandidate(candidates: CandidateSelector[]): CandidateSelector {
    // Sort by priority: unique first, then by confidence, then by strategy priority
    const strategyPriority = new Map(this._config.strategies.map(s => [s.name, s.priority]));
    
    return candidates.sort((a, b) => {
      // Prioritize unique selectors
      if (a.isUnique && !b.isUnique) return -1;
      if (!a.isUnique && b.isUnique) return 1;
      
      // Then by confidence
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;
      
      // Then by strategy priority
      const aPriority = strategyPriority.get(a.strategy) || 999;
      const bPriority = strategyPriority.get(b.strategy) || 999;
      return aPriority - bPriority;
    })[0];
  }

  getHealingAttempts(): HealingAttempt[] {
    return [...this._attempts];
  }

  clearHealingHistory(): void {
    this._attempts = [];
  }

  exportHealingReport(): string {
    return JSON.stringify({
      config: this._config,
      attempts: this._attempts,
      generatedAt: new Date().toISOString()
    }, null, 2);
  }
}

// Global healing manager instance
let globalHealingManager: HealingManager | null = null;

export function getHealingManager(): HealingManager {
  if (!globalHealingManager) {
    globalHealingManager = new HealingManager();
  }
  return globalHealingManager;
}

export function setHealingManager(manager: HealingManager): void {
  globalHealingManager = manager;
}