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

import type { HealingConfig } from '@playwright/core/lib/client/healing';

/**
 * Configuration for Playwright's self-healing locators feature.
 * Create this file in your project root to customize healing behavior.
 */
const healingConfig: HealingConfig = {
  // Enable or disable the self-healing feature globally
  enabled: true,

  // Maximum number of healing attempts per locator
  maxRetries: 3,

  // Healing strategies configuration
  strategies: [
    { name: 'role', enabled: true, priority: 1 },
    { name: 'text', enabled: true, priority: 2 },
    { name: 'testid', enabled: true, priority: 3 },
    { name: 'css', enabled: true, priority: 4 },
    { name: 'xpath', enabled: true, priority: 5 },
    { name: 'aria', enabled: true, priority: 6 }
  ],

  // Preferred fallback order for locator strategies
  fallbackOrder: ['role', 'text', 'testid', 'css', 'xpath', 'aria'],

  // Number of elements that should match for a selector to be considered unique
  uniquenessThreshold: 1,

  // Number of stability checks to perform on candidate selectors
  stabilityChecks: 2,

  // Enable debug mode for detailed healing information
  debugMode: false,

  // Logging level: 'none', 'basic', or 'verbose'
  logLevel: 'basic',

  // Take screenshots during healing attempts
  screenshotOnHealing: true,

  // Custom healing strategies (optional)
  // customStrategies: [
  //   {
  //     name: 'custom-strategy',
  //     generate: async (element, frame) => {
  //       // Your custom logic to generate alternative selectors
  //       return ['custom-selector-1', 'custom-selector-2'];
  //     },
  //     validate: async (selector, frame) => {
  //       // Optional validation logic
  //       return true;
  //     }
  //   }
  // ]
};

export default healingConfig;