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

import fs from 'fs';
import path from 'path';
import type { HealingResult } from './healingEngine';

export interface CodeModificationOptions {
  testFilePath: string;
  lineNumber: number;
  originalLocator: string;
  healedLocator: string;
  createBackup?: boolean;
}

export interface CodeModificationResult {
  success: boolean;
  modifiedFilePath: string;
  backupFilePath?: string;
  error?: string;
}

export class CodeModifier {
  
  async applyHealingToCode(options: CodeModificationOptions): Promise<CodeModificationResult> {
    try {
      // Validate inputs
      if (!fs.existsSync(options.testFilePath)) {
        return {
          success: false,
          modifiedFilePath: options.testFilePath,
          error: `Test file not found: ${options.testFilePath}`
        };
      }

      // Read the original file
      const originalContent = fs.readFileSync(options.testFilePath, 'utf8');
      const lines = originalContent.split('\n');

      // Create backup if requested
      let backupFilePath: string | undefined;
      if (options.createBackup !== false) {
        backupFilePath = `${options.testFilePath}.self-healing-backup.${Date.now()}`;
        fs.writeFileSync(backupFilePath, originalContent, 'utf8');
      }

      // Find and replace the locator
      const modifiedLines = this.replaceLocatorInLines(
        lines,
        options.lineNumber,
        options.originalLocator,
        options.healedLocator
      );

      if (!modifiedLines) {
        return {
          success: false,
          modifiedFilePath: options.testFilePath,
          error: `Could not find locator "${options.originalLocator}" at line ${options.lineNumber}`
        };
      }

      // Write the modified content
      const modifiedContent = modifiedLines.join('\n');
      fs.writeFileSync(options.testFilePath, modifiedContent, 'utf8');

      return {
        success: true,
        modifiedFilePath: options.testFilePath,
        backupFilePath
      };

    } catch (error) {
      return {
        success: false,
        modifiedFilePath: options.testFilePath,
        error: `Failed to modify code: ${error.message}`
      };
    }
  }

  private replaceLocatorInLines(
    lines: string[],
    targetLineNumber: number,
    originalLocator: string,
    healedLocator: string
  ): string[] | null {
    
    // Convert 1-based line number to 0-based array index
    const lineIndex = targetLineNumber - 1;
    
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return null;
    }

    // Try to find the original locator in the target line first
    let targetLine = lines[lineIndex];
    if (this.containsLocator(targetLine, originalLocator)) {
      lines[lineIndex] = this.replaceLocatorInLine(targetLine, originalLocator, healedLocator);
      return lines;
    }

    // If not found in exact line, search nearby lines (±3 lines)
    const searchRange = 3;
    for (let offset = 1; offset <= searchRange; offset++) {
      // Check line above
      if (lineIndex - offset >= 0) {
        const aboveLine = lines[lineIndex - offset];
        if (this.containsLocator(aboveLine, originalLocator)) {
          lines[lineIndex - offset] = this.replaceLocatorInLine(aboveLine, originalLocator, healedLocator);
          return lines;
        }
      }

      // Check line below
      if (lineIndex + offset < lines.length) {
        const belowLine = lines[lineIndex + offset];
        if (this.containsLocator(belowLine, originalLocator)) {
          lines[lineIndex + offset] = this.replaceLocatorInLine(belowLine, originalLocator, healedLocator);
          return lines;
        }
      }
    }

    return null;
  }

  private containsLocator(line: string, locator: string): boolean {
    // Remove extra whitespace and normalize quotes
    const normalizedLine = line.replace(/\s+/g, ' ').trim();
    const normalizedLocator = locator.replace(/\s+/g, ' ').trim();
    
    // Check for direct string match
    if (normalizedLine.includes(normalizedLocator)) {
      return true;
    }

    // Check for locator with different quote styles
    const locatorVariations = [
      `"${locator}"`,
      `'${locator}'`,
      `\`${locator}\``,
      locator.replace(/"/g, "'"),
      locator.replace(/'/g, '"')
    ];

    return locatorVariations.some(variation => normalizedLine.includes(variation));
  }

  private replaceLocatorInLine(line: string, originalLocator: string, healedLocator: string): string {
    // Try direct replacement first
    if (line.includes(originalLocator)) {
      return line.replace(originalLocator, healedLocator);
    }

    // Try with different quote styles
    const quoteStyles = ['"', "'", '`'];
    
    for (const quote of quoteStyles) {
      const quotedOriginal = `${quote}${originalLocator}${quote}`;
      const quotedHealed = `${quote}${healedLocator}${quote}`;
      
      if (line.includes(quotedOriginal)) {
        return line.replace(quotedOriginal, quotedHealed);
      }
    }

    // Try replacing inner content while preserving quotes
    for (const quote of quoteStyles) {
      const pattern = new RegExp(`${quote}[^${quote}]*${this.escapeRegex(originalLocator)}[^${quote}]*${quote}`);
      const match = line.match(pattern);
      
      if (match) {
        const replacement = `${quote}${healedLocator}${quote}`;
        return line.replace(match[0], replacement);
      }
    }

    // Fallback: just replace the original locator text
    return line.replace(originalLocator, healedLocator);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async listBackupFiles(testFilePath: string): Promise<string[]> {
    try {
      const dir = path.dirname(testFilePath);
      const baseName = path.basename(testFilePath);
      const files = fs.readdirSync(dir);
      
      return files
        .filter(file => file.startsWith(`${baseName}.self-healing-backup.`))
        .map(file => path.join(dir, file))
        .sort((a, b) => {
          // Sort by timestamp (newest first)
          const timestampA = parseInt(a.split('.').pop() || '0');
          const timestampB = parseInt(b.split('.').pop() || '0');
          return timestampB - timestampA;
        });
    } catch (error) {
      return [];
    }
  }

  async restoreFromBackup(backupFilePath: string, targetFilePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(backupFilePath)) {
        return false;
      }

      const backupContent = fs.readFileSync(backupFilePath, 'utf8');
      fs.writeFileSync(targetFilePath, backupContent, 'utf8');
      return true;
    } catch (error) {
      return false;
    }
  }

  async cleanupBackups(testFilePath: string, keepCount: number = 5): Promise<void> {
    try {
      const backupFiles = await this.listBackupFiles(testFilePath);
      
      // Keep only the most recent backups
      const filesToDelete = backupFiles.slice(keepCount);
      
      for (const file of filesToDelete) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          // Ignore individual file deletion errors
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}