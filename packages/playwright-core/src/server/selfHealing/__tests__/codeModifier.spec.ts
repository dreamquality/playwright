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
import { CodeModifier } from '../codeModifier';
import * as fs from 'fs';
import * as path from 'path';

test.describe('CodeModifier', () => {
  let modifier: CodeModifier;
  let testDir: string;

  test.beforeEach(() => {
    modifier = new CodeModifier();
    testDir = path.join(process.cwd(), '.test-tmp-' + Date.now());
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test.afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should create backup before modification', async () => {
    const testFile = path.join(testDir, 'test.spec.ts');
    const content = `test('example', async ({ page }) => {
  await page.locator('#old-button').click();
});`;
    fs.writeFileSync(testFile, content);

    const result = await modifier.applyHealingToCode({
      testFilePath: testFile,
      lineNumber: 2,
      originalLocator: '#old-button',
      healedLocator: '#new-button',
      createBackup: true,
    });

    expect(result.success).toBe(true);
    expect(result.backupFilePath).toBeDefined();
    if (result.backupFilePath) {
      expect(fs.existsSync(result.backupFilePath)).toBe(true);
    }
  });

  test('should replace locator correctly', async () => {
    const testFile = path.join(testDir, 'test.spec.ts');
    const content = `test('example', async ({ page }) => {
  await page.locator('#old-button').click();
});`;
    fs.writeFileSync(testFile, content);

    const result = await modifier.applyHealingToCode({
      testFilePath: testFile,
      lineNumber: 2,
      originalLocator: '#old-button',
      healedLocator: '#new-button',
      createBackup: false,
    });

    expect(result.success).toBe(true);
    const modifiedContent = fs.readFileSync(testFile, 'utf-8');
    expect(modifiedContent).toContain('#new-button');
    expect(modifiedContent).not.toContain('#old-button');
  });

  test('should handle file not found', async () => {
    const result = await modifier.applyHealingToCode({
      testFilePath: '/nonexistent/test.spec.ts',
      lineNumber: 1,
      originalLocator: '#old',
      healedLocator: '#new',
      createBackup: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should preserve file formatting', async () => {
    const testFile = path.join(testDir, 'test.spec.ts');
    const content = `test('example', async ({ page }) => {
    await page.locator('#old-button').click();
    await page.locator('#other-element').click();
});`;
    fs.writeFileSync(testFile, content);

    await modifier.applyHealingToCode({
      testFilePath: testFile,
      lineNumber: 2,
      originalLocator: '#old-button',
      healedLocator: '#new-button',
      createBackup: false,
    });

    const modifiedContent = fs.readFileSync(testFile, 'utf-8');
    // Check that only the target locator was changed
    expect(modifiedContent).toContain('#new-button');
    expect(modifiedContent).toContain('#other-element');
    expect(modifiedContent.split('\n').length).toBe(content.split('\n').length);
  });
});
