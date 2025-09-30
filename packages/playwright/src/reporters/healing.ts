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

import path from 'path';
import fs from 'fs';
import { getHealingManager } from '@playwright/core/lib/client/healing';

import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult
} from '@playwright/test/reporter';

/**
 * A Playwright reporter that generates healing reports and optionally 
 * updates test source code with healed selectors.
 */
export class HealingReporter implements Reporter {
  private _outputDir: string;
  private _updateSelectors: boolean;

  constructor(options: { outputDir?: string; updateSelectors?: boolean } = {}) {
    this._outputDir = options.outputDir || 'healing-report';
    this._updateSelectors = options.updateSelectors || !!process.env.PW_UPDATE_SELECTORS;
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    // Initialize healing manager with CLI options
    const healingManager = getHealingManager();
    
    const debugMode = !!process.env.PW_HEALING_DEBUG;
    const uiMode = !!process.env.PW_HEALING_UI;
    
    healingManager.updateConfig({
      debugMode,
      logLevel: debugMode ? 'verbose' : 'basic',
      screenshotOnHealing: debugMode
    });

    // Create output directory if it doesn't exist
    if (!fs.existsSync(this._outputDir)) {
      fs.mkdirSync(this._outputDir, { recursive: true });
    }

    console.log(`🔧 Self-healing locators enabled (debug: ${debugMode}, ui: ${uiMode})`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Check if this test had any healing attempts
    const healingManager = getHealingManager();
    const attempts = healingManager.getHealingAttempts();
    
    if (attempts.length > 0) {
      const testAttempts = attempts.filter(attempt => 
        // Simple heuristic: assume attempts during this test are related
        Date.now() - attempt.timestamp < 60000 // within last minute
      );

      if (testAttempts.length > 0) {
        const successfulHealings = testAttempts.filter(a => a.success);
        const failedHealings = testAttempts.filter(a => !a.success);

        if (successfulHealings.length > 0) {
          console.log(`✅ Test "${test.title}" had ${successfulHealings.length} successful healing(s)`);
          
          successfulHealings.forEach(healing => {
            console.log(`   ${healing.originalSelector} → ${healing.finalSelector} (${healing.strategy})`);
          });
        }

        if (failedHealings.length > 0) {
          console.log(`❌ Test "${test.title}" had ${failedHealings.length} failed healing attempt(s)`);
        }
      }
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const healingManager = getHealingManager();
    const allAttempts = healingManager.getHealingAttempts();
    
    if (allAttempts.length === 0) {
      console.log('🔧 No healing attempts were made during this test run.');
      return;
    }

    // Generate healing report
    const reportData = {
      summary: {
        totalAttempts: allAttempts.length,
        successfulHealings: allAttempts.filter(a => a.success).length,
        failedAttempts: allAttempts.filter(a => !a.success).length,
        strategiesUsed: [...new Set(allAttempts.map(a => a.strategy))],
        generatedAt: new Date().toISOString()
      },
      attempts: allAttempts.map(attempt => ({
        ...attempt,
        timestamp: new Date(attempt.timestamp).toISOString()
      })),
      config: healingManager.getConfig()
    };

    // Write JSON report
    const reportFile = path.join(this._outputDir, 'healing-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));

    // Write human-readable summary
    const summaryFile = path.join(this._outputDir, 'healing-summary.txt');
    const summaryContent = this._generateSummary(reportData);
    fs.writeFileSync(summaryFile, summaryContent);

    console.log(`📊 Healing report generated:`);
    console.log(`   ${reportData.summary.successfulHealings}/${reportData.summary.totalAttempts} healing attempts successful`);
    console.log(`   Report saved to: ${reportFile}`);
    console.log(`   Summary saved to: ${summaryFile}`);

    // Update selectors if requested
    if (this._updateSelectors) {
      await this._updateTestSelectors(allAttempts.filter(a => a.success));
    }
  }

  private _generateSummary(reportData: any): string {
    const { summary, attempts } = reportData;
    
    let content = 'PLAYWRIGHT SELF-HEALING LOCATORS REPORT\n';
    content += '=' .repeat(50) + '\n\n';
    
    content += `Generated: ${summary.generatedAt}\n`;
    content += `Total Attempts: ${summary.totalAttempts}\n`;
    content += `Successful Healings: ${summary.successfulHealings}\n`;
    content += `Failed Attempts: ${summary.failedAttempts}\n`;
    content += `Success Rate: ${summary.totalAttempts > 0 ? Math.round((summary.successfulHealings / summary.totalAttempts) * 100) : 0}%\n`;
    content += `Strategies Used: ${summary.strategiesUsed.join(', ')}\n\n`;

    if (summary.successfulHealings > 0) {
      content += 'SUCCESSFUL HEALINGS:\n';
      content += '-'.repeat(30) + '\n';
      
      attempts.filter((a: any) => a.success).forEach((attempt: any, index: number) => {
        content += `${index + 1}. ${attempt.originalSelector}\n`;
        content += `   → ${attempt.finalSelector}\n`;
        content += `   Strategy: ${attempt.strategy}\n`;
        content += `   Time: ${attempt.timestamp}\n\n`;
      });
    }

    if (summary.failedAttempts > 0) {
      content += 'FAILED ATTEMPTS:\n';
      content += '-'.repeat(20) + '\n';
      
      attempts.filter((a: any) => !a.success).forEach((attempt: any, index: number) => {
        content += `${index + 1}. ${attempt.originalSelector}\n`;
        content += `   Error: ${attempt.errorMessage || 'Unknown error'}\n`;
        content += `   Time: ${attempt.timestamp}\n\n`;
      });
    }

    return content;
  }

  private async _updateTestSelectors(successfulAttempts: any[]): Promise<void> {
    if (successfulAttempts.length === 0) {
      return;
    }

    console.log(`🔄 Updating ${successfulAttempts.length} selectors in test files...`);
    
    // Group attempts by original selector for deduplication
    const uniqueUpdates = new Map();
    successfulAttempts.forEach(attempt => {
      if (!uniqueUpdates.has(attempt.originalSelector)) {
        uniqueUpdates.set(attempt.originalSelector, attempt.finalSelector);
      }
    });

    // For now, just log what would be updated
    // TODO: Implement actual file updates using AST parsing
    uniqueUpdates.forEach((newSelector, oldSelector) => {
      console.log(`   Would update: "${oldSelector}" → "${newSelector}"`);
    });

    console.log(`ℹ️  Automatic selector updates not yet implemented. Please update manually.`);
  }
}

export default HealingReporter;