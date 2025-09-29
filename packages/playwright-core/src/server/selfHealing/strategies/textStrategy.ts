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

import type { HealingStrategy, HealingContext, CandidateElement } from '../healingEngine';

export class TextStrategy implements HealingStrategy {
  name = 'text';

  async findCandidates(context: HealingContext): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    const page = context.page;

    try {
      // Extract text content from original locator
      const textInfo = this.extractTextInfo(context.originalLocator);
      
      if (!textInfo || textInfo.length === 0) {
        return candidates;
      }

      // Find elements containing the exact text
      for (const text of textInfo) {
        const exactElements = await this.findByExactText(page, text);
        candidates.push(...exactElements);
        
        const partialElements = await this.findByPartialText(page, text);
        candidates.push(...partialElements);
      }

    } catch (error) {
      // Return empty candidates on error
    }

    return candidates;
  }

  private extractTextInfo(locator: string): string[] {
    const textValues: string[] = [];

    // Extract from getByText calls
    const getByTextMatches = locator.match(/getByText\s*\(\s*['"]([^'"]+)['"]/gi);
    if (getByTextMatches) {
      for (const match of getByTextMatches) {
        const textMatch = match.match(/['"]([^'"]+)['"]/);
        if (textMatch) textValues.push(textMatch[1]);
      }
    }

    // Extract from hasText filter
    const hasTextMatches = locator.match(/hasText\s*:\s*['"]([^'"]+)['"]/gi);
    if (hasTextMatches) {
      for (const match of hasTextMatches) {
        const textMatch = match.match(/['"]([^'"]+)['"]/);
        if (textMatch) textValues.push(textMatch[1]);
      }
    }

    // Extract from text selectors
    const textMatches = locator.match(/text\s*=\s*['"]([^'"]+)['"]/gi);
    if (textMatches) {
      for (const match of textMatches) {
        const textMatch = match.match(/['"]([^'"]+)['"]/);
        if (textMatch) textValues.push(textMatch[1]);
      }
    }

    // Extract text from XPath text() functions
    const xpathTextMatches = locator.match(/text\(\)\s*=\s*['"]([^'"]+)['"]/gi);
    if (xpathTextMatches) {
      for (const match of xpathTextMatches) {
        const textMatch = match.match(/['"]([^'"]+)['"]/);
        if (textMatch) textValues.push(textMatch[1]);
      }
    }

    // Extract contains() text from XPath
    const containsMatches = locator.match(/contains\([^,]+,\s*['"]([^'"]+)['"]\)/gi);
    if (containsMatches) {
      for (const match of containsMatches) {
        const textMatch = match.match(/['"]([^'"]+)['"]/);
        if (textMatch) textValues.push(textMatch[1]);
      }
    }

    return [...new Set(textValues)]; // Remove duplicates
  }

  private async findByExactText(page: any, text: string): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      const elements = await page.getByText(text, { exact: true }).all();
      
      for (const element of elements) {
        candidates.push({
          locator: `page.getByText('${text}', { exact: true })`,
          element,
          reasoning: `Exact text match: "${text}"`,
          strategy: this.name
        });
      }
    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private async findByPartialText(page: any, text: string): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      const elements = await page.getByText(text).all();
      
      for (const element of elements) {
        candidates.push({
          locator: `page.getByText('${text}')`,
          element,
          reasoning: `Partial text match: "${text}"`,
          strategy: this.name
        });
      }

      // Try finding by similar text patterns
      const words = text.split(/\s+/).filter(word => word.length > 2);
      
      for (const word of words) {
        try {
          const wordElements = await page.getByText(word).all();
          
          for (const element of wordElements) {
            const elementText = await element.textContent();
            if (elementText && this.isTextSimilar(elementText, text)) {
              candidates.push({
                locator: `page.getByText('${word}')`,
                element,
                reasoning: `Similar text via word "${word}": "${elementText}"`,
                strategy: this.name
              });
            }
          }
        } catch (error) {
          // Continue with next word
        }
      }

    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private isTextSimilar(text1: string, text2: string): boolean {
    const normalize = (str: string) => str.toLowerCase().trim().replace(/\s+/g, ' ');
    const normalized1 = normalize(text1);
    const normalized2 = normalize(text2);
    
    // Check for exact match
    if (normalized1 === normalized2) return true;
    
    // Check for substring match (at least 70% of the shorter text)
    const shorter = normalized1.length < normalized2.length ? normalized1 : normalized2;
    const longer = normalized1.length >= normalized2.length ? normalized1 : normalized2;
    
    if (longer.includes(shorter) && shorter.length >= longer.length * 0.7) {
      return true;
    }
    
    // Check for word overlap
    const words1 = normalized1.split(' ').filter(word => word.length > 2);
    const words2 = normalized2.split(' ').filter(word => word.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return false;
    
    const overlap = words1.filter(word => words2.includes(word));
    const similarity = overlap.length / Math.min(words1.length, words2.length);
    
    return similarity >= 0.6; // At least 60% word overlap
  }
}