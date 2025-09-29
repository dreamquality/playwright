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
import type { Progress } from '../progress';
import { HealingEngine, type SelfHealingConfig, type HealingResult } from './healingEngine';

export class SelfHealingWrapper {
  private healingEngine: HealingEngine | null = null;
  private config: SelfHealingConfig | null = null;

  constructor() {
    // Initialize lazily when config is provided
  }

  configure(config: SelfHealingConfig) {
    this.config = config;
    if (config.enabled) {
      this.healingEngine = new HealingEngine(config);
    } else {
      this.healingEngine = null;
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
        
        // Try with the healed locator
        try {
          // We would need to modify the action to use the new selector
          // For now, log the suggestion but continue with original error
          if (this.config?.notifyOnHeal) {
            console.log(`[Playwright Self-Healing] Found potential fix for selector "${originalSelector}": "${healingResult.appliedLocator}" (score: ${healingResult.score})`);
          }
        } catch (healedError) {
          context.progress.log(`[Self-Healing] Healed selector also failed`);
        }
      }

      // If healing failed or was not applied, throw the original error
      throw originalError;
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

// Global instance for the self-healing wrapper
let globalSelfHealingWrapper: SelfHealingWrapper | null = null;

export function getSelfHealingWrapper(): SelfHealingWrapper {
  if (!globalSelfHealingWrapper) {
    globalSelfHealingWrapper = new SelfHealingWrapper();
  }
  return globalSelfHealingWrapper;
}

export function configureSelfHealing(config: SelfHealingConfig) {
  const wrapper = getSelfHealingWrapper();
  wrapper.configure(config);
}