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
import { SuggestionStore } from '../suggestionStore';
import * as fs from 'fs';
import * as path from 'path';

test.describe('SuggestionStore', () => {
  let store: SuggestionStore;
  let testStorageFile: string;

  test.beforeEach(() => {
    testStorageFile = path.join(process.cwd(), `.test-storage-${Date.now()}.json`);
    store = new SuggestionStore(testStorageFile);
  });

  test.afterEach(() => {
    // Cleanup storage file
    if (fs.existsSync(testStorageFile)) {
      fs.unlinkSync(testStorageFile);
    }
  });

  test('should initialize with empty suggestions', async () => {
    const suggestions = await store.getAllSuggestions();
    expect(suggestions).toEqual([]);
  });

  test('should add suggestion', async () => {
    const suggestion = {
      id: 'test-1',
      timestamp: new Date().toISOString(),
      testName: 'example.spec.ts',
      originalLocator: '#old-button',
      healedLocator: '#new-button',
      confidence: 95,
      strategy: 'semantic' as const,
      applied: false,
    };

    await store.addSuggestion(suggestion);
    const suggestions = await store.getAllSuggestions();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe('test-1');
  });

  test('should retrieve suggestion by id', async () => {
    const suggestion = {
      id: 'test-2',
      timestamp: new Date().toISOString(),
      testName: 'example.spec.ts',
      originalLocator: '#old',
      healedLocator: '#new',
      confidence: 90,
      strategy: 'text' as const,
      applied: false,
    };

    await store.addSuggestion(suggestion);
    const retrieved = await store.getSuggestion('test-2');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-2');
  });

  test('should update suggestion status', async () => {
    const suggestion = {
      id: 'test-3',
      timestamp: new Date().toISOString(),
      testName: 'example.spec.ts',
      originalLocator: '#old',
      healedLocator: '#new',
      confidence: 85,
      strategy: 'structural' as const,
      applied: false,
    };

    await store.addSuggestion(suggestion);
    await store.markAsApplied('test-3');
    
    const retrieved = await store.getSuggestion('test-3');
    expect(retrieved?.applied).toBe(true);
  });

  test('should get statistics', async () => {
    await store.addSuggestion({
      id: 'test-4',
      timestamp: new Date().toISOString(),
      testName: 'example.spec.ts',
      originalLocator: '#old1',
      healedLocator: '#new1',
      confidence: 95,
      strategy: 'semantic' as const,
      applied: true,
    });

    await store.addSuggestion({
      id: 'test-5',
      timestamp: new Date().toISOString(),
      testName: 'example.spec.ts',
      originalLocator: '#old2',
      healedLocator: '#new2',
      confidence: 75,
      strategy: 'attribute' as const,
      applied: false,
    });

    const stats = await store.getStatistics();
    expect(stats.total).toBe(2);
    expect(stats.applied).toBe(1);
    expect(stats.pending).toBe(1);
  });

  test('should persist across instances', async () => {
    const suggestion = {
      id: 'test-6',
      timestamp: new Date().toISOString(),
      testName: 'example.spec.ts',
      originalLocator: '#old',
      healedLocator: '#new',
      confidence: 88,
      strategy: 'visual' as const,
      applied: false,
    };

    await store.addSuggestion(suggestion);

    // Create new instance with same storage file
    const store2 = new SuggestionStore(testStorageFile);
    const suggestions = await store2.getAllSuggestions();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe('test-6');
  });
});
