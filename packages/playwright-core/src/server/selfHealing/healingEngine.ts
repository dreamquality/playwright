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

import type { Page } from '../page';
import type { ElementHandle } from '../dom';
import { SemanticStrategy } from './strategies/semanticStrategy';
import { TextStrategy } from './strategies/textStrategy';
import { StructuralStrategy } from './strategies/structuralStrategy';
import { AttributeStrategy } from './strategies/attributeStrategy';
import { ScoringAlgorithm } from './scoringAlgorithm';
import { SuggestionStore } from './suggestionStore';

export interface SelfHealingConfig {
  enabled?: boolean;
  mode?: 'auto' | 'assisted' | 'suggestion-only';
  autoApplyThreshold?: number;
  strategies?: Array<'semantic' | 'text' | 'visual' | 'structural' | 'attribute'>;
  storageFile?: string;
  notifyOnHeal?: boolean;
  excludeTests?: RegExp[];
  learnFromManualSelections?: boolean;
}

export interface HealingContext {
  page: Page;
  originalLocator: string;
  failedElement?: ElementHandle;
  testName?: string;
  lineNumber?: number;
  screenshot?: string;
  previouslySuccessfulElements?: ElementHandle[];
  domSnapshot?: any;
}

export interface CandidateElement {
  locator: string;
  element: ElementHandle;
  reasoning: string;
  strategy: string;
}

export interface ScoredCandidate extends CandidateElement {
  score: number;
}

export interface HealingResult {
  success: boolean;
  appliedLocator?: string;
  score?: number;
  strategy?: string;
  reason?: string;
  candidates?: ScoredCandidate[];
  applied?: boolean;
}

export interface HealingStrategy {
  name: string;
  findCandidates(context: HealingContext): Promise<CandidateElement[]>;
}

export class HealingEngine {
  private strategies: HealingStrategy[];
  private config: SelfHealingConfig;
  private scoringAlgorithm: ScoringAlgorithm;
  private suggestionStore: SuggestionStore;

  constructor(config: SelfHealingConfig) {
    this.config = {
      enabled: false,
      mode: 'suggestion-only',
      autoApplyThreshold: 90,
      strategies: ['semantic', 'text', 'structural', 'attribute'],
      storageFile: '.playwright/self-healing-suggestions.json',
      notifyOnHeal: false,
      excludeTests: [],
      learnFromManualSelections: false,
      ...config
    };
    
    this.strategies = this.initializeStrategies(this.config.strategies || []);
    this.scoringAlgorithm = new ScoringAlgorithm();
    this.suggestionStore = new SuggestionStore(this.config.storageFile || '');
  }

  private initializeStrategies(strategyNames: string[]): HealingStrategy[] {
    const strategies: HealingStrategy[] = [];
    
    for (const name of strategyNames) {
      switch (name) {
        case 'semantic':
          strategies.push(new SemanticStrategy());
          break;
        case 'text':
          strategies.push(new TextStrategy());
          break;
        case 'structural':
          strategies.push(new StructuralStrategy());
          break;
        case 'attribute':
          strategies.push(new AttributeStrategy());
          break;
      }
    }
    
    return strategies;
  }

  async attemptHealing(
    page: Page,
    failedLocator: string,
    context: Partial<HealingContext>
  ): Promise<HealingResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        reason: 'Self-healing is disabled'
      };
    }

    // Check if test is excluded
    if (this.config.excludeTests && context.testName) {
      for (const regex of this.config.excludeTests) {
        if (regex.test(context.testName)) {
          return {
            success: false,
            reason: 'Test excluded from self-healing'
          };
        }
      }
    }

    const healingContext: HealingContext = {
      page,
      originalLocator: failedLocator,
      testName: context.testName,
      lineNumber: context.lineNumber,
      screenshot: context.screenshot,
      ...context
    };

    // Capture current state
    const snapshot = await this.captureSnapshot(page);
    healingContext.domSnapshot = snapshot;

    // Run all strategies in parallel
    const candidateGroups = await Promise.all(
      this.strategies.map(s => s.findCandidates(healingContext))
    );

    // Flatten and deduplicate candidates
    const uniqueCandidates = this.deduplicateCandidates(candidateGroups.flat());

    // Score all candidates
    const scoredCandidates = await this.scoreCandidates(
      uniqueCandidates,
      healingContext
    );

    // Sort by score
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Apply healing based on mode
    const result = await this.applyHealing(
      page,
      failedLocator,
      scoredCandidates,
      snapshot
    );

    // Log and store
    await this.logHealingAttempt(result);

    return result;
  }

  private async captureSnapshot(page: Page): Promise<any> {
    // Capture DOM snapshot for analysis
    try {
      // Capture screenshot for better context
      let screenshot: string | undefined;
      try {
        // Create a simple progress controller for screenshot
        const progress = {
          log: () => {},
          cleanupWhenAborted: () => {},
          throwIfAborted: () => {}
        } as any;
        
        const screenshotBuffer = await page.screenshot(progress, {});
        screenshot = screenshotBuffer.toString('base64');
      } catch (screenshotError) {
        // Screenshot capture failed, continue without it
        console.warn('[Self-Healing] Screenshot capture failed:', screenshotError.message);
      }

      return {
        url: page.mainFrame().url(),
        title: await page.mainFrame().title(),
        timestamp: Date.now(),
        screenshot
      };
    } catch (error) {
      return {
        url: 'unknown',
        title: 'unknown',
        timestamp: Date.now(),
        screenshot: undefined
      };
    }
  }

  private deduplicateCandidates(candidates: CandidateElement[]): CandidateElement[] {
    const seen = new Set<string>();
    return candidates.filter(candidate => {
      const key = `${candidate.locator}:${candidate.strategy}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async scoreCandidates(
    candidates: CandidateElement[],
    context: HealingContext
  ): Promise<ScoredCandidate[]> {
    const scoredCandidates: ScoredCandidate[] = [];

    for (const candidate of candidates) {
      try {
        const score = await this.scoringAlgorithm.scoreCandidate(candidate, context);
        scoredCandidates.push({
          ...candidate,
          score
        });
      } catch (error) {
        // Skip candidates that can't be scored
        continue;
      }
    }

    return scoredCandidates;
  }

  private async applyHealing(
    page: Page,
    original: string,
    candidates: ScoredCandidate[],
    snapshot: any
  ): Promise<HealingResult> {
    const best = candidates[0];

    if (!best) {
      return {
        success: false,
        reason: 'No candidates found',
        candidates
      };
    }

    switch (this.config.mode) {
      case 'auto':
        if (best.score >= (this.config.autoApplyThreshold || 90)) {
          return {
            success: true,
            appliedLocator: best.locator,
            score: best.score,
            applied: true,
            candidates
          };
        }
        return {
          success: false,
          reason: `Best candidate score ${best.score} below auto-apply threshold ${this.config.autoApplyThreshold}`,
          candidates
        };

      case 'assisted':
        return {
          success: true,
          appliedLocator: best.locator,
          score: best.score,
          applied: false, // Requires manual approval
          candidates
        };

      case 'suggestion-only':
      default:
        return {
          success: false,
          reason: 'Suggestion-only mode, no automatic application',
          candidates
        };
    }
  }

  private async logHealingAttempt(result: HealingResult): Promise<void> {
    if (this.config.notifyOnHeal && result.success) {
      console.log(`[Playwright Self-Healing] Applied healing: ${result.appliedLocator} (score: ${result.score})`);
    }

    // Store suggestion for later review
    await this.suggestionStore.storeSuggestion({
      timestamp: Date.now(),
      result,
      applied: result.applied || false
    });
  }

  isEnabled(): boolean {
    return this.config.enabled || false;
  }

  getConfig(): SelfHealingConfig {
    return { ...this.config };
  }
}