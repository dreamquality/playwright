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

import { Locator, LocatorOptions } from './locator';
import { Frame } from './frame';
import { getHealingManager, HealingAttempt } from './healing';
import { TimeoutError } from './errors';

import type { TimeoutOptions, SelectOption } from './types';
import type * as api from '../../types/types';

export class SelfHealingLocator extends Locator implements api.Locator {
  private _originalSelector: string;
  private _healingAttempts: HealingAttempt[] = [];
  private _isHealed: boolean = false;

  constructor(frame: Frame, selector: string, options?: LocatorOptions) {
    super(frame, selector, options);
    this._originalSelector = selector;
  }

  private async _withHealing<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: TimeoutOptions
  ): Promise<T> {
    const healingManager = getHealingManager();
    const config = healingManager.getConfig();

    if (!config.enabled) {
      return await operation();
    }

    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts <= config.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Only try healing if this looks like a selector error
        if (this._isSelectorError(error) && attempts < config.maxRetries) {
          if (config.logLevel === 'verbose') {
            console.log(`[Playwright Healing] ${operationName} failed with selector ${this._selector}, attempting healing...`);
          }

          const healingResult = await healingManager.healLocator(this._frame, this._originalSelector);
          
          if (healingResult) {
            // Update selector and try again
            this._selector = healingResult.selector;
            this._isHealed = true;
            this._healingAttempts.push(healingResult.attempt);
            
            if (config.logLevel !== 'none') {
              console.log(`[Playwright Healing] Successfully healed selector for ${operationName}: ${this._originalSelector} → ${healingResult.selector}`);
            }
          } else {
            if (config.logLevel === 'verbose') {
              console.warn(`[Playwright Healing] Could not heal selector for ${operationName}: ${this._originalSelector}`);
            }
            break;
          }
        } else {
          break;
        }
        attempts++;
      }
    }

    // If we get here, all healing attempts failed
    throw lastError || new Error(`Operation ${operationName} failed after ${attempts} attempts`);
  }

  private _isSelectorError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message || '';
    return (
      message.includes('No element matching') ||
      message.includes('strict mode violation') ||
      message.includes('Could not resolve') ||
      message.includes('Timeout') ||
      error instanceof TimeoutError
    );
  }

  // Override key locator methods to use healing

  override async click(options?: Parameters<Locator['click']>[0]): Promise<void> {
    return this._withHealing(
      () => super.click(options),
      'click',
      options
    );
  }

  override async dblclick(options?: Parameters<Locator['dblclick']>[0]): Promise<void> {
    return this._withHealing(
      () => super.dblclick(options),
      'dblclick',
      options
    );
  }

  override async fill(value: string, options?: TimeoutOptions): Promise<void> {
    return this._withHealing(
      () => super.fill(value, options),
      'fill',
      options
    );
  }

  override async type(text: string, options?: Parameters<Locator['type']>[1]): Promise<void> {
    return this._withHealing(
      () => super.type(text, options),
      'type',
      options
    );
  }

  override async press(key: string, options?: TimeoutOptions): Promise<void> {
    return this._withHealing(
      () => super.press(key, options),
      'press',
      options
    );
  }

  override async check(options?: TimeoutOptions): Promise<void> {
    return this._withHealing(
      () => super.check(options),
      'check',
      options
    );
  }

  override async uncheck(options?: TimeoutOptions): Promise<void> {
    return this._withHealing(
      () => super.uncheck(options),
      'uncheck',
      options
    );
  }

  override async hover(options?: Parameters<Locator['hover']>[0]): Promise<void> {
    return this._withHealing(
      () => super.hover(options),
      'hover',
      options
    );
  }

  override async focus(options?: TimeoutOptions): Promise<void> {
    return this._withHealing(
      () => super.focus(options),
      'focus',
      options
    );
  }

  override async blur(options?: TimeoutOptions): Promise<void> {
    return this._withHealing(
      () => super.blur(options),
      'blur',
      options
    );
  }

  override async selectOption(values: string | api.ElementHandle | SelectOption | string[] | api.ElementHandle[] | SelectOption[], options?: TimeoutOptions): Promise<string[]> {
    return this._withHealing(
      () => super.selectOption(values, options),
      'selectOption',
      options
    );
  }

  override async textContent(options?: TimeoutOptions): Promise<string | null> {
    return this._withHealing(
      () => super.textContent(options),
      'textContent',
      options
    );
  }

  override async innerText(options?: TimeoutOptions): Promise<string> {
    return this._withHealing(
      () => super.innerText(options),
      'innerText',
      options
    );
  }

  override async innerHTML(options?: TimeoutOptions): Promise<string> {
    return this._withHealing(
      () => super.innerHTML(options),
      'innerHTML',
      options
    );
  }

  override async getAttribute(name: string, options?: TimeoutOptions): Promise<string | null> {
    return this._withHealing(
      () => super.getAttribute(name, options),
      'getAttribute',
      options
    );
  }

  override async isVisible(options?: TimeoutOptions): Promise<boolean> {
    return this._withHealing(
      () => super.isVisible(options),
      'isVisible',
      options
    );
  }

  override async isHidden(options?: TimeoutOptions): Promise<boolean> {
    return this._withHealing(
      () => super.isHidden(options),
      'isHidden',
      options
    );
  }

  override async isEnabled(options?: TimeoutOptions): Promise<boolean> {
    return this._withHealing(
      () => super.isEnabled(options),
      'isEnabled',
      options
    );
  }

  override async isDisabled(options?: TimeoutOptions): Promise<boolean> {
    return this._withHealing(
      () => super.isDisabled(options),
      'isDisabled',
      options
    );
  }

  override async isChecked(options?: TimeoutOptions): Promise<boolean> {
    return this._withHealing(
      () => super.isChecked(options),
      'isChecked',
      options
    );
  }

  override async waitFor(options?: Parameters<Locator['waitFor']>[0]): Promise<void> {
    return this._withHealing(
      () => super.waitFor(options),
      'waitFor',
      options
    );
  }

  override async screenshot(options?: Parameters<Locator['screenshot']>[0]): Promise<Buffer> {
    return this._withHealing(
      () => super.screenshot(options),
      'screenshot',
      options
    );
  }

  // Override chaining methods to return SelfHealingLocator instances

  override and(locator: Locator): SelfHealingLocator {
    const baseLocator = super.and(locator);
    return new SelfHealingLocator(this._frame, baseLocator._selector);
  }

  override or(locator: Locator): SelfHealingLocator {
    const baseLocator = super.or(locator);
    return new SelfHealingLocator(this._frame, baseLocator._selector);
  }

  override locator(selectorOrLocator: string | Locator, options?: Omit<LocatorOptions, 'visible'>): SelfHealingLocator {
    const baseLocator = super.locator(selectorOrLocator, options);
    return new SelfHealingLocator(this._frame, baseLocator._selector);
  }

  override filter(options?: LocatorOptions): SelfHealingLocator {
    const baseLocator = super.filter(options);
    return new SelfHealingLocator(this._frame, baseLocator._selector);
  }

  override first(): SelfHealingLocator {
    const baseLocator = super.first();
    return new SelfHealingLocator(this._frame, baseLocator._selector);
  }

  override last(): SelfHealingLocator {
    const baseLocator = super.last();
    return new SelfHealingLocator(this._frame, baseLocator._selector);
  }

  override nth(index: number): SelfHealingLocator {
    const baseLocator = super.nth(index);
    return new SelfHealingLocator(this._frame, baseLocator._selector);
  }

  // Additional methods for healing information

  getOriginalSelector(): string {
    return this._originalSelector;
  }

  getCurrentSelector(): string {
    return this._selector;
  }

  isHealed(): boolean {
    return this._isHealed;
  }

  getHealingAttempts(): HealingAttempt[] {
    return [...this._healingAttempts];
  }

  getHealingHistory(): {
    originalSelector: string;
    currentSelector: string;
    isHealed: boolean;
    attempts: HealingAttempt[];
  } {
    return {
      originalSelector: this._originalSelector,
      currentSelector: this._selector,
      isHealed: this._isHealed,
      attempts: [...this._healingAttempts]
    };
  }
}

// Factory function to create self-healing locators
export function createSelfHealingLocator(frame: Frame, selector: string, options?: LocatorOptions): SelfHealingLocator {
  return new SelfHealingLocator(frame, selector, options);
}