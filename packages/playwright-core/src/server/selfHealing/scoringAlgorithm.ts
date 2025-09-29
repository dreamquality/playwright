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

import type { CandidateElement, HealingContext, ScoredCandidate } from './healingEngine';
import type { ElementHandle } from '../dom';
import { ProgressController } from '../progress';

export class ScoringAlgorithm {
  async scoreCandidate(candidate: CandidateElement, context: HealingContext): Promise<number> {
    let score = 0;
    let weightSum = 0;

    // Strategy-based scoring
    const strategyWeight = this.getStrategyWeight(candidate.strategy);
    score += this.getStrategyScore(candidate.strategy) * strategyWeight;
    weightSum += strategyWeight;

    // Locator similarity scoring
    const similarityWeight = 30;
    const similarityScore = this.calculateLocatorSimilarity(candidate.locator, context.originalLocator);
    score += similarityScore * similarityWeight;
    weightSum += similarityWeight;

    // Element visibility and interactability
    const visibilityWeight = 20;
    const visibilityScore = await this.assessElementVisibility(candidate.element);
    score += visibilityScore * visibilityWeight;
    weightSum += visibilityWeight;

    // Position similarity (if we have previous successful elements)
    if (context.previouslySuccessfulElements && context.previouslySuccessfulElements.length > 0) {
      const positionWeight = 15;
      const positionScore = await this.calculatePositionSimilarity(candidate.element, context.previouslySuccessfulElements[0]);
      score += positionScore * positionWeight;
      weightSum += positionWeight;
    }

    // Normalize score to 0-100 range
    return weightSum > 0 ? Math.min(100, Math.max(0, score / weightSum * 100)) : 0;
  }

  private getStrategyWeight(strategy: string): number {
    // Weight strategies by their typical reliability
    switch (strategy) {
      case 'semantic':
        return 40; // Highest weight - most reliable
      case 'text':
        return 25;
      case 'structural':
        return 20;
      case 'attribute':
        return 15; // Lowest weight - least reliable
      default:
        return 10;
    }
  }

  private getStrategyScore(strategy: string): number {
    // Base score for each strategy
    switch (strategy) {
      case 'semantic':
        return 90;
      case 'text':
        return 80;
      case 'structural':
        return 70;
      case 'attribute':
        return 60;
      default:
        return 50;
    }
  }

  private calculateLocatorSimilarity(newLocator: string, originalLocator: string): number {
    // Simple similarity calculation based on common tokens
    const newTokens = this.tokenizeLocator(newLocator);
    const originalTokens = this.tokenizeLocator(originalLocator);
    
    const intersection = newTokens.filter(token => originalTokens.includes(token));
    const union = [...new Set([...newTokens, ...originalTokens])];
    
    return union.length > 0 ? (intersection.length / union.length) * 100 : 0;
  }

  private tokenizeLocator(locator: string): string[] {
    // Extract meaningful tokens from locator
    const tokens: string[] = [];
    
    // Extract role, text, attribute values etc.
    const patterns = [
      /role\s*=\s*['"]([^'"]+)['"]/g,
      /text\s*=\s*['"]([^'"]+)['"]/g,
      /name\s*=\s*['"]([^'"]+)['"]/g,
      /placeholder\s*=\s*['"]([^'"]+)['"]/g,
      /id\s*=\s*['"]([^'"]+)['"]/g,
      /class\s*=\s*['"]([^'"]+)['"]/g,
      /data-testid\s*=\s*['"]([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(locator)) !== null) {
        tokens.push(match[1].toLowerCase());
      }
    }

    // Extract CSS selectors and XPath tokens
    const words = locator.toLowerCase().match(/\w+/g) || [];
    tokens.push(...words);
    
    return [...new Set(tokens)]; // Remove duplicates
  }

  private async assessElementVisibility(element: ElementHandle): Promise<number> {
    try {
      // Check if element is visible and interactable
      const controller = new ProgressController();
      const result = await controller.run(async (progress) => {
        const isVisible = await element.isVisible(progress);
        const isEnabled = await element.isEnabled(progress);
        
        let score = 0;
        if (isVisible) score += 70;
        if (isEnabled) score += 30;
        
        return score;
      });
      
      return result;
    } catch (error) {
      return 0; // Element not accessible
    }
  }

  private async calculatePositionSimilarity(newElement: ElementHandle, referenceElement: ElementHandle): Promise<number> {
    try {
      const newBox = await newElement.boundingBox();
      const refBox = await referenceElement.boundingBox();
      
      if (!newBox || !refBox) return 0;
      
      // Calculate distance between centers
      const newCenterX = newBox.x + newBox.width / 2;
      const newCenterY = newBox.y + newBox.height / 2;
      const refCenterX = refBox.x + refBox.width / 2;
      const refCenterY = refBox.y + refBox.height / 2;
      
      const distance = Math.sqrt(
        Math.pow(newCenterX - refCenterX, 2) + Math.pow(newCenterY - refCenterY, 2)
      );
      
      // Normalize distance to score (closer = higher score)
      // Assume elements within 100px are considered similar position
      const maxDistance = 100;
      return Math.max(0, (maxDistance - distance) / maxDistance * 100);
    } catch (error) {
      return 0;
    }
  }
}