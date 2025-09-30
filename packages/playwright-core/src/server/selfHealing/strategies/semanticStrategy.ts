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

export class SemanticStrategy implements HealingStrategy {
  name = 'semantic';

  async findCandidates(context: HealingContext): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    const page = context.page;

    try {
      // Extract semantic information from the original locator
      const semanticInfo = this.extractSemanticInfo(context.originalLocator);
      
      if (!semanticInfo) {
        return candidates;
      }

      // Find elements by role with similar attributes
      if (semanticInfo.role) {
        const roleElements = await this.findByRole(page, semanticInfo);
        candidates.push(...roleElements);
      }

      // Find elements by aria-label or label association
      if (semanticInfo.label) {
        const labelElements = await this.findByLabel(page, semanticInfo);
        candidates.push(...labelElements);
      }

      // Find elements by placeholder
      if (semanticInfo.placeholder) {
        const placeholderElements = await this.findByPlaceholder(page, semanticInfo);
        candidates.push(...placeholderElements);
      }

      // Find elements by title attribute
      if (semanticInfo.title) {
        const titleElements = await this.findByTitle(page, semanticInfo);
        candidates.push(...titleElements);
      }

    } catch (error) {
      // Return empty candidates on error
    }

    return candidates;
  }

  private extractSemanticInfo(locator: string): {
    role?: string;
    label?: string;
    placeholder?: string;
    title?: string;
    name?: string;
  } | null {
    const info: any = {};

    // Extract role
    const roleMatch = locator.match(/role\s*:\s*['"]([^'"]+)['"]/i) || 
                     locator.match(/getByRole\s*\(\s*['"]([^'"]+)['"]/i);
    if (roleMatch) info.role = roleMatch[1];

    // Extract label/name
    const labelMatch = locator.match(/name\s*:\s*['"]([^'"]+)['"]/i) ||
                      locator.match(/getByLabel\s*\(\s*['"]([^'"]+)['"]/i);
    if (labelMatch) info.label = labelMatch[1];

    // Extract placeholder
    const placeholderMatch = locator.match(/placeholder\s*:\s*['"]([^'"]+)['"]/i) ||
                            locator.match(/getByPlaceholder\s*\(\s*['"]([^'"]+)['"]/i);
    if (placeholderMatch) info.placeholder = placeholderMatch[1];

    // Extract title
    const titleMatch = locator.match(/title\s*:\s*['"]([^'"]+)['"]/i) ||
                      locator.match(/getByTitle\s*\(\s*['"]([^'"]+)['"]/i);
    if (titleMatch) info.title = titleMatch[1];

    return Object.keys(info).length > 0 ? info : null;
  }

  private async findByRole(page: any, semanticInfo: any): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      // Find exact role match
      let locator = `role=${semanticInfo.role}`;
      if (semanticInfo.label) {
        locator += `[name="${semanticInfo.label}"]`;
      }
      
      const elements = await page.locator(`role=${semanticInfo.role}`).all();
      
      for (const element of elements) {
        candidates.push({
          locator: `page.getByRole('${semanticInfo.role}')`,
          element,
          reasoning: `Same role: ${semanticInfo.role}`,
          strategy: this.name
        });
      }

      // Find role with similar names if original had a name
      if (semanticInfo.label) {
        const similarNameElements = await page.locator(`role=${semanticInfo.role}`).all();
        
        for (const element of similarNameElements) {
          try {
            const accessibleName = await element.getAttribute('aria-label') || 
                                   await element.getAttribute('alt') ||
                                   await element.textContent();
            
            if (accessibleName && this.isTextSimilar(accessibleName, semanticInfo.label)) {
              candidates.push({
                locator: `page.getByRole('${semanticInfo.role}', { name: '${accessibleName}' })`,
                element,
                reasoning: `Similar role and name: ${semanticInfo.role} / ${accessibleName}`,
                strategy: this.name
              });
            }
          } catch (error) {
            // Skip this element
          }
        }
      }
    } catch (error) {
      // Ignore errors finding by role
    }

    return candidates;
  }

  private async findByLabel(page: any, semanticInfo: any): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      // Find by exact label
      const elements = await page.getByLabel(semanticInfo.label).all();
      
      for (const element of elements) {
        candidates.push({
          locator: `page.getByLabel('${semanticInfo.label}')`,
          element,
          reasoning: `Same label: ${semanticInfo.label}`,
          strategy: this.name
        });
      }

      // Find by similar labels
      const allLabeled = await page.locator('[aria-label], [aria-labelledby], label').all();
      
      for (const element of allLabeled) {
        try {
          const labelText = await element.getAttribute('aria-label') ||
                           await element.textContent() ||
                           '';
          
          if (labelText && this.isTextSimilar(labelText, semanticInfo.label)) {
            candidates.push({
              locator: `page.getByLabel('${labelText}')`,
              element,
              reasoning: `Similar label: ${labelText}`,
              strategy: this.name
            });
          }
        } catch (error) {
          // Skip this element
        }
      }
    } catch (error) {
      // Ignore errors finding by label
    }

    return candidates;
  }

  private async findByPlaceholder(page: any, semanticInfo: any): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      const elements = await page.getByPlaceholder(semanticInfo.placeholder).all();
      
      for (const element of elements) {
        candidates.push({
          locator: `page.getByPlaceholder('${semanticInfo.placeholder}')`,
          element,
          reasoning: `Same placeholder: ${semanticInfo.placeholder}`,
          strategy: this.name
        });
      }
    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private async findByTitle(page: any, semanticInfo: any): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      const elements = await page.getByTitle(semanticInfo.title).all();
      
      for (const element of elements) {
        candidates.push({
          locator: `page.getByTitle('${semanticInfo.title}')`,
          element,
          reasoning: `Same title: ${semanticInfo.title}`,
          strategy: this.name
        });
      }
    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private isTextSimilar(text1: string, text2: string): boolean {
    // Simple text similarity check
    const normalize = (str: string) => str.toLowerCase().trim().replace(/\s+/g, ' ');
    const normalized1 = normalize(text1);
    const normalized2 = normalize(text2);
    
    // Check for exact match
    if (normalized1 === normalized2) return true;
    
    // Check for substring match
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;
    
    // Check for word overlap
    const words1 = normalized1.split(' ');
    const words2 = normalized2.split(' ');
    const overlap = words1.filter(word => words2.includes(word));
    
    return overlap.length > 0 && overlap.length >= Math.min(words1.length, words2.length) * 0.5;
  }
}