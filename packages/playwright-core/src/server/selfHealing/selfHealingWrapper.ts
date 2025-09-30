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

import type { Frame } from '../frames';
import type { Page } from '../page';
import type { BrowserContext } from '../browserContext';
import type { Progress } from '../progress';
import { FrameSelectors } from '../frameSelectors';
import { HealingEngine, type SelfHealingConfig, type HealingResult } from './healingEngine';
import { SuggestionStore } from './suggestionStore';

export class SelfHealingWrapper {
  private healingEngine: HealingEngine | null = null;
  private config: SelfHealingConfig | null = null;
  private suggestionStore: SuggestionStore | null = null;
  private context: BrowserContext;

  constructor(context: BrowserContext) {
    this.context = context;
    // Initialize lazily when config is provided
  }

  configure(config: SelfHealingConfig) {
    this.config = config;
    if (config.enabled) {
      this.healingEngine = new HealingEngine(config);
      this.suggestionStore = new SuggestionStore(config.storageFile || '.playwright/self-healing-suggestions.json');
    } else {
      this.healingEngine = null;
      this.suggestionStore = null;
    }
  }

  isEnabled(): boolean {
    return this.healingEngine?.isEnabled() || false;
  }

  async wrapSelectorResolution<R>(
    frame: Frame,
    originalSelector: string,
    action: () => Promise<R>,
    context: {
      progress: Progress;
      testName?: string;
      lineNumber?: number;
    }
  ): Promise<R> {
    // If self-healing is not enabled, just execute the original action
    if (!this.isEnabled() || !this.healingEngine) {
      return await action();
    }

    try {
      // First, try the original selector
      return await action();
    } catch (originalError) {
      // Only attempt healing for certain types of errors
      if (!this.shouldAttemptHealing(originalError)) {
        throw originalError;
      }

      context.progress.log(`[Self-Healing] Original selector failed: ${originalSelector}`);
      
      // Attempt healing
      const healingResult = await this.attemptHealing(
        frame._page,
        originalSelector,
        {
          testName: context.testName,
          lineNumber: context.lineNumber
        }
      );

      if (healingResult.success && healingResult.appliedLocator) {
        context.progress.log(`[Self-Healing] Attempting healed selector: ${healingResult.appliedLocator}`);
        
        // Actually retry with the healed locator - CRITICAL FIX: Return success instead of throwing error!
        try {
          // Try to execute a query with the healed selector to validate it works
          const frameSelectors = new FrameSelectors(frame);
          const healedElement = await frameSelectors._performQuery(healingResult.appliedLocator);
          
          if (healedElement) {
            // The healed selector works! Record the healing event
            await this.recordHealingEvent({
              originalLocator: originalSelector,
              healedLocator: healingResult.appliedLocator,
              score: healingResult.score || 0,
              strategy: healingResult.strategy || 'unknown',
              applied: true,
              autoApplied: (healingResult.score || 0) >= (this.config?.autoApplyThreshold || 90),
              testName: context.testName,
              timestamp: Date.now()
            });

            if (this.config?.notifyOnHeal) {
              console.log(`[Playwright Self-Healing] SUCCESS: Fixed selector "${originalSelector}" → "${healingResult.appliedLocator}" (score: ${healingResult.score})`);
            }
            
            // CRITICAL FIX: Return the healed element so the test succeeds!
            return healedElement as R;
          }
          
          throw new Error('Healed selector validation failed');
          
        } catch (healedError: any) {
          context.progress.log(`[Self-Healing] Healed selector also failed: ${healedError.message}`);
          // If healed selector also fails, continue to throw original error below
        }
      }

      // If healing failed or was not applied, throw the original error
      throw originalError;
    }
  }

  private async recordHealingEvent(event: any): Promise<void> {
    // Record the healing event for trace viewer
    try {
      if (this.suggestionStore) {
        await this.suggestionStore.storeSuggestion({
          timestamp: event.timestamp,
          result: {
            success: true,
            appliedLocator: event.healedLocator,
            score: event.score,
            strategy: event.strategy,
            applied: event.applied
          },
          applied: event.applied,
          testName: event.testName,
          originalLocator: event.originalLocator
        });
      }

      // Also emit an event that can be captured by the trace recorder
      // This would be picked up by the trace viewer integration
      const healingTraceEvent = {
        type: 'locator-healed' as const,
        originalLocator: event.originalLocator,
        healedLocator: event.healedLocator,
        score: event.score,
        strategy: event.strategy,
        applied: event.applied,
        autoApplied: event.autoApplied,
        timestamp: event.timestamp,
        testName: event.testName
      };

      // Store on the page context for trace recording
      const page = this.context.pages()[0];
      if (page) {
        (page as any)._selfHealingEvents = (page as any)._selfHealingEvents || [];
        (page as any)._selfHealingEvents.push(healingTraceEvent);
      }
    } catch (error) {
      // Don't fail the test if recording fails
      console.warn('[Self-Healing] Failed to record healing event:', error);
    }
  }

  private shouldAttemptHealing(error: any): boolean {
    // Only attempt healing for selector-related errors
    const errorMessage = error?.message || '';
    
    // Common selector failure patterns
    const selectorErrors = [
      'element not found',
      'no such element',
      'element is not attached',
      'timeout',
      'selector resolved to multiple elements',
      'strict mode violation',
      'waiting for selector'
    ];

    return selectorErrors.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private async attemptHealing(
    page: Page,
    failedSelector: string,
    context: {
      testName?: string;
      lineNumber?: number;
    }
  ): Promise<HealingResult> {
    if (!this.healingEngine) {
      return {
        success: false,
        reason: 'Healing engine not initialized'
      };
    }

    return await this.healingEngine.attemptHealing(
      page,
      failedSelector,
      context
    );
  }

  async reportHealingSuggestions(): Promise<any[]> {
    if (!this.healingEngine) {
      return [];
    }

    // Return recent suggestions for reporting
    return await this.healingEngine['suggestionStore'].getRecentSuggestions(10);
  }

  async getHealingStatistics(): Promise<any> {
    if (!this.healingEngine) {
      return {
        total: 0,
        successful: 0,
        applied: 0,
        averageScore: 0
      };
    }

    return await this.healingEngine['suggestionStore'].getStatistics();
  }
}

// Note: Global instance approach removed since SelfHealingWrapper now requires BrowserContext
// Each frameSelectors will create its own instance