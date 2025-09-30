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

export interface StoredSuggestion {
  timestamp: number;
  result: HealingResult;
  applied: boolean;
  testName?: string;
  originalLocator?: string;
}

export class SuggestionStore {
  private storageFile: string;

  constructor(storageFile: string) {
    this.storageFile = storageFile;
    this.ensureStorageDirectory();
  }

  private ensureStorageDirectory(): void {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      // Ignore errors in storage directory creation
    }
  }

  async storeSuggestion(suggestion: StoredSuggestion): Promise<void> {
    try {
      let suggestions: StoredSuggestion[] = [];
      
      // Load existing suggestions
      if (fs.existsSync(this.storageFile)) {
        const content = fs.readFileSync(this.storageFile, 'utf-8');
        suggestions = JSON.parse(content);
      }
      
      // Add new suggestion
      suggestions.push(suggestion);
      
      // Keep only last 100 suggestions to prevent file growth
      if (suggestions.length > 100) {
        suggestions = suggestions.slice(-100);
      }
      
      // Save back to file
      fs.writeFileSync(this.storageFile, JSON.stringify(suggestions, null, 2));
    } catch (error) {
      // Ignore errors in storing suggestions - don't break the test
    }
  }

  async loadSuggestions(): Promise<StoredSuggestion[]> {
    try {
      if (!fs.existsSync(this.storageFile)) {
        return [];
      }
      
      const content = fs.readFileSync(this.storageFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return [];
    }
  }

  async getRecentSuggestions(limit: number = 10): Promise<StoredSuggestion[]> {
    const suggestions = await this.loadSuggestions();
    return suggestions.slice(-limit).reverse(); // Most recent first
  }

  async clearSuggestions(): Promise<void> {
    try {
      if (fs.existsSync(this.storageFile)) {
        fs.unlinkSync(this.storageFile);
      }
    } catch (error) {
      // Ignore errors
    }
  }

  async getSuccessfulHealings(): Promise<StoredSuggestion[]> {
    const suggestions = await this.loadSuggestions();
    return suggestions.filter(s => s.result.success && s.applied);
  }

  async getStatistics(): Promise<{
    total: number;
    successful: number;
    applied: number;
    averageScore: number;
  }> {
    const suggestions = await this.loadSuggestions();
    const successful = suggestions.filter(s => s.result.success);
    const applied = suggestions.filter(s => s.applied);
    
    const scores = successful
      .map(s => s.result.score || 0)
      .filter(score => score > 0);
    
    const averageScore = scores.length > 0 
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length 
      : 0;
    
    return {
      total: suggestions.length,
      successful: successful.length,
      applied: applied.length,
      averageScore: Math.round(averageScore * 100) / 100
    };
  }
}