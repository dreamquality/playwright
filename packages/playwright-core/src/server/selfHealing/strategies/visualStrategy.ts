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

import type { Page } from '../../page';
import type { Frame } from '../../frames';

export interface VisualCandidate {
  locator: string;
  score: number;
  reasoning: string;
  element?: any;
}

export interface HealingContext {
  originalLocator: string;
  failureContext: {
    testName: string;
    lineNumber?: number;
    screenshot?: string;
  };
  page: Page;
  frame: Frame;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComputedStyle {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  display?: string;
  position?: string;
}

/**
 * Visual Strategy for Self-Healing
 * 
 * Finds candidate elements based on visual properties and position:
 * - Position-based similarity (±100px from original location)
 * - Visual style matching (color, backgroundColor, fontSize, fontWeight)
 * - Size similarity (width, height within 20% tolerance)
 * - Bounding box comparison for spatial relationships
 * 
 * This strategy is particularly effective for:
 * - UI refactoring that preserves visual design
 * - Elements that moved slightly in the layout
 * - Style-based element identification
 */
export class VisualStrategy {
  readonly name = 'visual';
  readonly weight = 0.15; // 15% weight in scoring algorithm

  /**
   * Finds candidate elements based on visual similarity
   */
  async findCandidates(context: HealingContext): Promise<VisualCandidate[]> {
    try {
      const candidates: VisualCandidate[] = [];

      // First, try to get the original element's visual properties (if it existed before)
      const originalVisualProps = await this.extractOriginalVisualProperties(context);
      
      if (!originalVisualProps) {
        // If we can't determine original properties, try position-based search
        return await this.findByPositionOnly(context);
      }

      // Find elements with similar visual properties
      const visualCandidates = await this.findByVisualSimilarity(context, originalVisualProps);
      candidates.push(...visualCandidates);

      // Find elements in similar positions
      const positionalCandidates = await this.findByPosition(context, originalVisualProps);
      candidates.push(...positionalCandidates);

      // Find elements with similar sizes
      const sizeCandidates = await this.findBySizeMatch(context, originalVisualProps);
      candidates.push(...sizeCandidates);

      // Deduplicate candidates
      const uniqueCandidates = this.deduplicateCandidates(candidates);

      return uniqueCandidates;
    } catch (error) {
      console.warn('[Visual Strategy] Error finding candidates:', error);
      return [];
    }
  }

  /**
   * Extracts visual properties from the original element if available
   */
  private async extractOriginalVisualProperties(context: HealingContext): Promise<any> {
    try {
      // Try to get snapshot or historical data about the element
      // For now, we'll use heuristics based on the locator type
      const locator = context.originalLocator;

      // Extract basic properties from common locator patterns
      const properties: any = {
        tagName: this.extractTagNameFromLocator(locator),
        position: null,
        size: null,
        style: null
      };

      return properties;
    } catch (error) {
      return null;
    }
  }

  /**
   * Finds candidates by visual style similarity
   */
  private async findByVisualSimilarity(
    context: HealingContext,
    originalProps: any
  ): Promise<VisualCandidate[]> {
    try {
      const candidates: VisualCandidate[] = [];

      // Query all visible interactive elements
      const elements = await context.frame.evaluateAll((root: any) => {
        const interactiveElements = root.querySelectorAll(
          'button, a, input, select, textarea, [role="button"], [role="link"], [onclick]'
        );

        return Array.from(interactiveElements).map((el: any) => {
          const rect = el.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(el);

          return {
            selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
            tagName: el.tagName.toLowerCase(),
            position: {
              x: rect.x,
              y: rect.y,
            },
            size: {
              width: rect.width,
              height: rect.height,
            },
            style: {
              color: computedStyle.color,
              backgroundColor: computedStyle.backgroundColor,
              fontSize: computedStyle.fontSize,
              fontWeight: computedStyle.fontWeight,
              display: computedStyle.display,
            },
            isVisible: rect.width > 0 && rect.height > 0 && computedStyle.display !== 'none',
          };
        });
      });

      // Score each element based on visual similarity
      for (const element of elements) {
        if (!element.isVisible) continue;

        const score = this.calculateVisualSimilarityScore(element, originalProps);

        if (score > 50) {
          // Only include candidates with decent similarity
          candidates.push({
            locator: this.buildLocatorFromElement(element),
            score,
            reasoning: `Visual similarity: ${Math.round(score)}% (style and position match)`,
          });
        }
      }

      return candidates;
    } catch (error) {
      console.warn('[Visual Strategy] Error in findByVisualSimilarity:', error);
      return [];
    }
  }

  /**
   * Finds candidates by position proximity
   */
  private async findByPosition(
    context: HealingContext,
    originalProps: any
  ): Promise<VisualCandidate[]> {
    if (!originalProps.position) return [];

    try {
      const candidates: VisualCandidate[] = [];
      const maxDistance = 100; // pixels

      // Find elements within proximity
      const elements = await context.frame.evaluateAll((root: any, targetPos: any, maxDist: number) => {
        const allElements = root.querySelectorAll('*');

        return Array.from(allElements)
          .map((el: any) => {
            const rect = el.getBoundingClientRect();
            const distance = Math.sqrt(
              Math.pow(rect.x - targetPos.x, 2) + Math.pow(rect.y - targetPos.y, 2)
            );

            if (distance <= maxDist && rect.width > 0 && rect.height > 0) {
              return {
                selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
                tagName: el.tagName.toLowerCase(),
                distance,
                position: { x: rect.x, y: rect.y },
              };
            }
            return null;
          })
          .filter(Boolean);
      }, originalProps.position, maxDistance);

      for (const element of elements) {
        const proximityScore = 100 - (element.distance / maxDistance) * 100;

        candidates.push({
          locator: element.selector || `${element.tagName}`,
          score: proximityScore,
          reasoning: `Position proximity: ${Math.round(element.distance)}px away (${Math.round(proximityScore)}% match)`,
        });
      }

      return candidates;
    } catch (error) {
      console.warn('[Visual Strategy] Error in findByPosition:', error);
      return [];
    }
  }

  /**
   * Finds candidates by size similarity
   */
  private async findBySizeMatch(
    context: HealingContext,
    originalProps: any
  ): Promise<VisualCandidate[]> {
    if (!originalProps.size) return [];

    try {
      const candidates: VisualCandidate[] = [];
      const sizeTolerance = 0.2; // 20% tolerance

      const elements = await context.frame.evaluateAll(
        (root: any, targetSize: any, tolerance: number) => {
          const allElements = root.querySelectorAll('*');

          return Array.from(allElements)
            .map((el: any) => {
              const rect = el.getBoundingClientRect();

              if (rect.width === 0 || rect.height === 0) return null;

              const widthDiff = Math.abs(rect.width - targetSize.width) / targetSize.width;
              const heightDiff = Math.abs(rect.height - targetSize.height) / targetSize.height;

              if (widthDiff <= tolerance && heightDiff <= tolerance) {
                return {
                  selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
                  tagName: el.tagName.toLowerCase(),
                  size: { width: rect.width, height: rect.height },
                  widthDiff,
                  heightDiff,
                };
              }
              return null;
            })
            .filter(Boolean);
        },
        originalProps.size,
        sizeTolerance
      );

      for (const element of elements) {
        const avgDiff = (element.widthDiff + element.heightDiff) / 2;
        const sizeScore = (1 - avgDiff) * 100;

        candidates.push({
          locator: element.selector || `${element.tagName}`,
          score: sizeScore,
          reasoning: `Size similarity: ${Math.round(sizeScore)}% match (width: ${Math.round(element.size.width)}px, height: ${Math.round(element.size.height)}px)`,
        });
      }

      return candidates;
    } catch (error) {
      console.warn('[Visual Strategy] Error in findBySizeMatch:', error);
      return [];
    }
  }

  /**
   * Finds candidates by position only (fallback)
   */
  private async findByPositionOnly(context: HealingContext): Promise<VisualCandidate[]> {
    try {
      // Find interactive elements and return them with position info
      const elements = await context.frame.evaluateAll((root: any) => {
        const interactiveElements = root.querySelectorAll(
          'button, a, input, select, textarea, [role="button"], [role="link"], [onclick]'
        );

        return Array.from(interactiveElements)
          .map((el: any, index: number) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return null;

            return {
              selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : `[data-index="${index}"]`),
              tagName: el.tagName.toLowerCase(),
              position: { x: rect.x, y: rect.y },
            };
          })
          .filter(Boolean);
      });

      return elements.map((element, index) => ({
        locator: element.selector,
        score: 60 - index, // Prioritize by DOM order
        reasoning: `Interactive element at position (${Math.round(element.position.x)}, ${Math.round(element.position.y)})`,
      }));
    } catch (error) {
      console.warn('[Visual Strategy] Error in findByPositionOnly:', error);
      return [];
    }
  }

  /**
   * Calculates visual similarity score
   */
  private calculateVisualSimilarityScore(element: any, originalProps: any): number {
    let score = 0;
    let factorCount = 0;

    // Tag name match (20%)
    if (originalProps.tagName && element.tagName === originalProps.tagName) {
      score += 20;
    }
    factorCount++;

    // Style similarity (40%)
    if (originalProps.style && element.style) {
      const styleScore = this.compareStyles(element.style, originalProps.style);
      score += styleScore * 0.4;
      factorCount++;
    }

    // Position proximity (20%)
    if (originalProps.position && element.position) {
      const distance = Math.sqrt(
        Math.pow(element.position.x - originalProps.position.x, 2) +
        Math.pow(element.position.y - originalProps.position.y, 2)
      );
      const proximityScore = Math.max(0, 100 - distance);
      score += proximityScore * 0.2;
      factorCount++;
    }

    // Size similarity (20%)
    if (originalProps.size && element.size) {
      const sizeScore = this.compareSizes(element.size, originalProps.size);
      score += sizeScore * 0.2;
      factorCount++;
    }

    return score;
  }

  /**
   * Compares two style objects
   */
  private compareStyles(style1: ComputedStyle, style2: ComputedStyle): number {
    let matches = 0;
    let total = 0;

    const compareColor = (c1?: string, c2?: string) => {
      if (!c1 || !c2) return false;
      // Normalize and compare colors (basic comparison)
      return c1.replace(/\s/g, '') === c2.replace(/\s/g, '');
    };

    if (style1.color && style2.color) {
      if (compareColor(style1.color, style2.color)) matches++;
      total++;
    }

    if (style1.backgroundColor && style2.backgroundColor) {
      if (compareColor(style1.backgroundColor, style2.backgroundColor)) matches++;
      total++;
    }

    if (style1.fontSize && style2.fontSize) {
      if (style1.fontSize === style2.fontSize) matches++;
      total++;
    }

    if (style1.fontWeight && style2.fontWeight) {
      if (style1.fontWeight === style2.fontWeight) matches++;
      total++;
    }

    return total > 0 ? (matches / total) * 100 : 50;
  }

  /**
   * Compares two size objects
   */
  private compareSizes(size1: any, size2: any): number {
    const widthDiff = Math.abs(size1.width - size2.width) / size2.width;
    const heightDiff = Math.abs(size1.height - size2.height) / size2.height;

    const avgDiff = (widthDiff + heightDiff) / 2;
    return Math.max(0, (1 - avgDiff) * 100);
  }

  /**
   * Extracts tag name from locator string
   */
  private extractTagNameFromLocator(locator: string): string | null {
    // Try to extract tag name from common locator patterns
    const tagPatterns = [
      /^(button|input|select|textarea|a|div|span|p|h\d)/i,
      /getByRole\(['"](\w+)['"]/i,
    ];

    for (const pattern of tagPatterns) {
      const match = locator.match(pattern);
      if (match) return match[1].toLowerCase();
    }

    return null;
  }

  /**
   * Builds a locator string from element data
   */
  private buildLocatorFromElement(element: any): string {
    if (element.selector && element.selector.includes('#')) {
      return element.selector; // Has ID, use it
    }

    // Try to build a meaningful locator
    const tagName = element.tagName || 'element';

    if (element.text) {
      return `${tagName}:has-text("${element.text.substring(0, 30)}")`;
    }

    return `${tagName}:visible`;
  }

  /**
   * Deduplicates candidates by selector
   */
  private deduplicateCandidates(candidates: VisualCandidate[]): VisualCandidate[] {
    const seen = new Map<string, VisualCandidate>();

    for (const candidate of candidates) {
      const existing = seen.get(candidate.locator);

      if (!existing || candidate.score > existing.score) {
        seen.set(candidate.locator, candidate);
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.score - a.score);
  }
}
