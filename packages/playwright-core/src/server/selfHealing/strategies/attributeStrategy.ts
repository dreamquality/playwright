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

export class AttributeStrategy implements HealingStrategy {
  name = 'attribute';

  async findCandidates(context: HealingContext): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    const page = context.page;

    try {
      // Extract attribute information from original locator
      const attributeInfo = this.extractAttributeInfo(context.originalLocator);
      
      if (!attributeInfo || Object.keys(attributeInfo).length === 0) {
        return candidates;
      }

      // Find elements by similar attributes
      for (const [attrName, attrValue] of Object.entries(attributeInfo)) {
        const exactElements = await this.findByExactAttribute(page, attrName, attrValue);
        candidates.push(...exactElements);
        
        const similarElements = await this.findBySimilarAttribute(page, attrName, attrValue);
        candidates.push(...similarElements);
      }

    } catch (error) {
      // Return empty candidates on error
    }

    return candidates;
  }

  private extractAttributeInfo(locator: string): Record<string, string> {
    const attributes: Record<string, string> = {};

    // Extract data-testid
    const testidMatch = locator.match(/data-testid\s*=\s*['"]([^'"]+)['"]/i) ||
                       locator.match(/getByTestId\s*\(\s*['"]([^'"]+)['"]/i);
    if (testidMatch) attributes['data-testid'] = testidMatch[1];

    // Extract id
    const idMatch = locator.match(/\bid\s*=\s*['"]([^'"]+)['"]/i) ||
                   locator.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) attributes['id'] = idMatch[1];

    // Extract class
    const classMatch = locator.match(/class\s*=\s*['"]([^'"]+)['"]/i) ||
                      locator.match(/\.([a-zA-Z0-9_-]+)/);
    if (classMatch) attributes['class'] = classMatch[1];

    // Extract name attribute
    const nameMatch = locator.match(/\bname\s*=\s*['"]([^'"]+)['"]/i);
    if (nameMatch) attributes['name'] = nameMatch[1];

    // Extract type attribute
    const typeMatch = locator.match(/\btype\s*=\s*['"]([^'"]+)['"]/i);
    if (typeMatch) attributes['type'] = typeMatch[1];

    // Extract value attribute
    const valueMatch = locator.match(/\bvalue\s*=\s*['"]([^'"]+)['"]/i);
    if (valueMatch) attributes['value'] = valueMatch[1];

    // Extract href attribute
    const hrefMatch = locator.match(/\bhref\s*=\s*['"]([^'"]+)['"]/i);
    if (hrefMatch) attributes['href'] = hrefMatch[1];

    // Extract alt attribute
    const altMatch = locator.match(/\balt\s*=\s*['"]([^'"]+)['"]/i);
    if (altMatch) attributes['alt'] = altMatch[1];

    // Extract custom data attributes
    const dataMatches = locator.matchAll(/data-([a-zA-Z0-9_-]+)\s*=\s*['"]([^'"]+)['"]/gi);
    for (const match of dataMatches) {
      attributes[`data-${match[1]}`] = match[2];
    }

    return attributes;
  }

  private async findByExactAttribute(page: any, attrName: string, attrValue: string): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      let selector: string;
      let locatorCall: string;

      switch (attrName) {
        case 'data-testid':
        case 'data-test-id':
        case 'data-test':
          selector = `[${attrName}="${attrValue}"]`;
          locatorCall = `page.getByTestId('${attrValue}')`;
          break;
        case 'id':
          selector = `#${attrValue}`;
          locatorCall = `page.locator('#${attrValue}')`;
          break;
        case 'name':
          selector = `[name="${attrValue}"]`;
          locatorCall = `page.locator('[name="${attrValue}"]')`;
          break;
        default:
          selector = `[${attrName}="${attrValue}"]`;
          locatorCall = `page.locator('[${attrName}="${attrValue}"]')`;
      }

      const elements = await page.locator(selector).all();
      
      for (const element of elements) {
        candidates.push({
          locator: locatorCall,
          element,
          reasoning: `Exact attribute match: ${attrName}="${attrValue}"`,
          strategy: this.name
        });
      }
    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private async findBySimilarAttribute(page: any, attrName: string, attrValue: string): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      // Find elements with the same attribute name but different values
      const selector = `[${attrName}]`;
      const elements = await page.locator(selector).all();
      
      for (const element of elements) {
        try {
          const actualValue = await element.getAttribute(attrName);
          
          if (actualValue && this.isAttributeValueSimilar(actualValue, attrValue)) {
            let locatorCall: string;
            
            switch (attrName) {
              case 'data-testid':
              case 'data-test-id':
              case 'data-test':
                locatorCall = `page.getByTestId('${actualValue}')`;
                break;
              case 'id':
                locatorCall = `page.locator('#${actualValue}')`;
                break;
              default:
                locatorCall = `page.locator('[${attrName}="${actualValue}"]')`;
            }

            candidates.push({
              locator: locatorCall,
              element,
              reasoning: `Similar attribute value: ${attrName}="${actualValue}" (original: "${attrValue}")`,
              strategy: this.name
            });
          }
        } catch (error) {
          // Skip this element
        }
      }

      // For class attributes, also check for partial class matches
      if (attrName === 'class') {
        const classVariations = await this.findByPartialClass(page, attrValue);
        candidates.push(...classVariations);
      }

    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private async findByPartialClass(page: any, className: string): Promise<CandidateElement[]> {
    const candidates: CandidateElement[] = [];
    
    try {
      // Split class name and try individual classes
      const classes = className.split(/\s+/);
      
      for (const singleClass of classes) {
        if (singleClass.length < 3) continue; // Skip very short class names
        
        const elements = await page.locator(`.${singleClass}`).all();
        
        for (const element of elements) {
          candidates.push({
            locator: `page.locator('.${singleClass}')`,
            element,
            reasoning: `Partial class match: ${singleClass} (from: ${className})`,
            strategy: this.name
          });
        }
      }

      // Try prefix/suffix matching for generated class names
      const baseClassName = className.replace(/[-_]\d+$/, ''); // Remove numeric suffixes
      if (baseClassName !== className && baseClassName.length > 3) {
        const elements = await page.locator(`[class*="${baseClassName}"]`).all();
        
        for (const element of elements) {
          const actualClass = await element.getAttribute('class');
          if (actualClass) {
            candidates.push({
              locator: `page.locator('[class*="${baseClassName}"]')`,
              element,
              reasoning: `Class prefix match: ${baseClassName} in "${actualClass}"`,
              strategy: this.name
            });
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return candidates;
  }

  private isAttributeValueSimilar(value1: string, value2: string): boolean {
    const normalize = (str: string) => str.toLowerCase().trim();
    const normalized1 = normalize(value1);
    const normalized2 = normalize(value2);
    
    // Exact match
    if (normalized1 === normalized2) return true;
    
    // Check for partial match (useful for generated IDs)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      const shorter = normalized1.length < normalized2.length ? normalized1 : normalized2;
      const longer = normalized1.length >= normalized2.length ? normalized1 : normalized2;
      
      // Similar if the shorter string is at least 60% of the longer one
      return shorter.length >= longer.length * 0.6;
    }
    
    // Check for common patterns in generated attributes
    const pattern1 = this.extractPattern(normalized1);
    const pattern2 = this.extractPattern(normalized2);
    
    if (pattern1 && pattern2 && pattern1 === pattern2) {
      return true;
    }
    
    return false;
  }

  private extractPattern(value: string): string | null {
    // Extract common patterns from generated attributes
    
    // Remove numbers and keep text pattern
    const textPattern = value.replace(/\d+/g, '#');
    if (textPattern !== value && textPattern.length > 3) {
      return textPattern;
    }
    
    // Remove UUIDs and keep prefix/suffix
    const uuidPattern = value.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, 'UUID');
    if (uuidPattern !== value && uuidPattern.length > 3) {
      return uuidPattern;
    }
    
    return null;
  }
}