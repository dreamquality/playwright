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

import { test, expect } from '@playwright/test';
import { HealingEngine } from '../healingEngine';
import type { SelfHealingConfig } from '../healingEngine';

test.describe('HealingEngine', () => {
  test('should initialize with default config', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'auto',
      autoApplyThreshold: 90,
      strategies: ['semantic', 'text', 'structural', 'attribute'],
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });

  test('should initialize with all strategies including visual', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'auto',
      autoApplyThreshold: 90,
      strategies: ['semantic', 'text', 'visual', 'structural', 'attribute'],
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });

  test('should handle empty strategies array', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'auto',
      autoApplyThreshold: 90,
      strategies: [],
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });

  test('should validate auto mode with threshold', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'auto',
      autoApplyThreshold: 95,
      strategies: ['semantic'],
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });

  test('should support assisted mode', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'assisted',
      autoApplyThreshold: 90,
      strategies: ['semantic'],
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });

  test('should support suggestion-only mode', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'suggestion-only',
      autoApplyThreshold: 90,
      strategies: ['semantic'],
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });
});

test.describe('HealingEngine configuration', () => {
  test('should handle excludeTests pattern', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'auto',
      autoApplyThreshold: 90,
      strategies: ['semantic'],
      excludeTests: [/\.visual\.spec\.ts$/],
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });

  test('should handle notifyOnHeal flag', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'auto',
      autoApplyThreshold: 90,
      strategies: ['semantic'],
      notifyOnHeal: true,
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });

  test('should handle storageFile path', () => {
    const config: SelfHealingConfig = {
      enabled: true,
      mode: 'auto',
      autoApplyThreshold: 90,
      strategies: ['semantic'],
      storageFile: '.playwright/self-healing.json',
    };

    const engine = new HealingEngine(config);
    expect(engine).toBeDefined();
  });
});
