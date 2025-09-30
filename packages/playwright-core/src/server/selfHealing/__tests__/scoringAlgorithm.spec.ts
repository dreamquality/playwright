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
import { ScoringAlgorithm } from '../scoringAlgorithm';
import type { Candidate, ScoringContext } from '../scoringAlgorithm';

test.describe('ScoringAlgorithm', () => {
  let algorithm: ScoringAlgorithm;

  test.beforeEach(() => {
    algorithm = new ScoringAlgorithm();
  });

  test('should score candidates with strategy weights', () => {
    const candidate: Candidate = {
      locator: 'button[data-testid="submit"]',
      strategy: 'semantic',
      baseScore: 80,
      element: {} as any,
    };

    const context: ScoringContext = {
      originalLocator: 'button#old-submit',
      failedElement: null,
    };

    const score = algorithm.scoreCandidate(candidate, context);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('should apply semantic strategy weight correctly', () => {
    const candidate: Candidate = {
      locator: 'button[role="button"]',
      strategy: 'semantic',
      baseScore: 80,
      element: {} as any,
    };

    const context: ScoringContext = {
      originalLocator: 'button#submit',
      failedElement: null,
    };

    const score = algorithm.scoreCandidate(candidate, context);
    expect(score).toBeGreaterThan(0);
  });

  test('should normalize scores to 0-100 range', () => {
    const candidate: Candidate = {
      locator: 'button',
      strategy: 'semantic',
      baseScore: 120,
      element: {} as any,
    };

    const context: ScoringContext = {
      originalLocator: 'button#submit',
      failedElement: null,
    };

    const score = algorithm.scoreCandidate(candidate, context);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
