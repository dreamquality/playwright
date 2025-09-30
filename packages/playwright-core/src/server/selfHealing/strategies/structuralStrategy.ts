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

export class StructuralStrategy implements HealingStrategy {
  name = 'structural';

  async findCandidates(context: HealingContext): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    const page = context.page;

    try {
      // Extract structural information from original locator
      const structuralInfo = this.extractStructuralInfo(context.originalLocator);
      
      if (!structuralInfo) {
        return candidates;
      }

      // Find elements by similar CSS selectors
      if (structuralInfo.css) {
        const cssElements = await this.findBySimilarCSS(page, structuralInfo.css);
        candidates.push(...cssElements);
      }

      // Find elements by similar position in DOM
      if (structuralInfo.position) {
        const positionElements = await this.findBySimilarPosition(page, structuralInfo.position);
        candidates.push(...positionElements);
      }

      // Find by similar tag hierarchy
      if (structuralInfo.tagHierarchy) {
        const hierarchyElements = await this.findBySimilarHierarchy(page, structuralInfo.tagHierarchy);
        candidates.push(...hierarchyElements);
      }

    } catch (error) {
      // Return empty candidates on error
    }

    return candidates;
  }

  private extractStructuralInfo(locator: string): {
    css?: string;
    position?: string;
    tagHierarchy?: string[];
  } | null {
    const info: any = {};

    // Extract CSS selectors
    const cssMatch = locator.match(/css\s*=\s*['"]([^'"]+)['"]/i) ||
                    locator.match(/locator\s*\(\s*['"]([^'"]+)['"]/i);
    if (cssMatch) {
      info.css = cssMatch[1];
    }

    // Extract nth-child patterns
    const nthMatch = locator.match(/nth\((\d+)\)/i);
    if (nthMatch) {
      info.position = nthMatch[1];
    }

    // Extract tag hierarchy from CSS selector
    if (info.css) {
      const tags = info.css.split(/[>\s]+/).map((part: string) =>
        part.replace(/[#.[\]()'"]/g, '').split(/[#.]/)[0]
      ).filter((tag: string) => tag && /^[a-zA-Z]/.test(tag));
      
      if (tags.length > 0) {
        info.tagHierarchy = tags;
      }
    }

    return Object.keys(info).length > 0 ? info : null;
  }

  private async findBySimilarCSS(page: any, originalCSS: string): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      // Generate variations of the CSS selector
      const variations = this.generateCSSVariations(originalCSS);
      
      for (const css of variations) {
        try {
          const elements = await page.locator(css).all();
          
          for (const element of elements) {
            candidates.push({
              locator: `page.locator('${css}')`,
              element,
              reasoning: `Similar CSS structure: ${css}`,
              strategy: this.name
            });
          }
        } catch (error) {
          // Skip invalid selectors
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private generateCSSVariations(css: string): string[] {
    const variations: string[] = [];
    
    // Remove specific IDs but keep structure
    let noId = css.replace(/#[a-zA-Z0-9_-]+/g, '');
    if (noId !== css && noId.trim()) {
      variations.push(noId);
    }
    
    // Remove specific classes but keep structure
    let noClass = css.replace(/\.[a-zA-Z0-9_-]+/g, '');
    if (noClass !== css && noClass.trim()) {
      variations.push(noClass);
    }
    
    // Remove nth-child selectors
    let noNth = css.replace(/:nth-child\(\d+\)/g, '');
    if (noNth !== css && noNth.trim()) {
      variations.push(noNth);
    }
    
    // Try with just tag names
    const tagOnly = css.replace(/[#.[\]():]/g, ' ').split(/\s+/).filter(t => /^[a-zA-Z]/.test(t)).join(' ');
    if (tagOnly && tagOnly !== css) {
      variations.push(tagOnly);
    }
    
    // Try parent selectors (remove last part)
    const parts = css.split(/[>\s]+/);
    if (parts.length > 1) {
      const parent = parts.slice(0, -1).join(' ');
      if (parent.trim()) {
        variations.push(parent);
      }
    }
    
    return [...new Set(variations)];
  }

  private async findBySimilarPosition(page: any, position: string): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      const pos = parseInt(position, 10);
      
      // Find elements at similar positions (±2)
      for (let i = Math.max(0, pos - 2); i <= pos + 2; i++) {
        try {
          const elements = await page.locator(`>> nth=${i}`).all();
          
          for (const element of elements) {
            candidates.push({
              locator: `page.locator('>> nth=${i}')`,
              element,
              reasoning: `Similar DOM position: ${i} (original: ${pos})`,
              strategy: this.name
            });
          }
        } catch (error) {
          // Skip invalid positions
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private async findBySimilarHierarchy(page: any, tagHierarchy: string[]): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      // Generate selectors based on tag hierarchy
      const hierarchySelectors = this.generateHierarchySelectors(tagHierarchy);
      
      for (const selector of hierarchySelectors) {
        try {
          const elements = await page.locator(selector).all();
          
          for (const element of elements) {
            candidates.push({
              locator: `page.locator('${selector}')`,
              element,
              reasoning: `Similar tag hierarchy: ${selector}`,
              strategy: this.name
            });
          }
        } catch (error) {
          // Skip invalid selectors
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private generateHierarchySelectors(tags: string[]): string[] {
    const selectors: string[] = [];
    
    if (tags.length < 2) return selectors;
    
    // Full hierarchy
    selectors.push(tags.join(' '));
    
    // Hierarchy with descendant combinators
    selectors.push(tags.join(' > '));
    
    // Last 2-3 levels only
    if (tags.length >= 2) {
      selectors.push(tags.slice(-2).join(' '));
    }
    if (tags.length >= 3) {
      selectors.push(tags.slice(-3).join(' '));
    }
    
    // Skip middle levels (keep first and last few)
    if (tags.length >= 4) {
      const simplified = [tags[0], ...tags.slice(-2)];
      selectors.push(simplified.join(' '));
    }
    
    return [...new Set(selectors)];
  }
}