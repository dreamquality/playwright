# PRD: Self-Healing System for Microsoft Playwright - Implementation as Pull Request

## Executive Summary

Create a self-healing capability for the official Microsoft Playwright (@playwright/test) package as a **backwards-compatible extension** that integrates seamlessly into the existing codebase. This feature will automatically adapt test locators when UI changes occur, with full transparency and debugging capabilities via Debug Mode and UI Mode.

## Core Principles for Integration

1. **Zero Breaking Changes**: All existing tests must continue to work without modifications
2. **Opt-in Feature**: Self-healing is disabled by default and must be explicitly enabled
3. **Minimal Footprint**: Reuse existing Playwright infrastructure (locator engine, debug tools, UI Mode)
4. **Code Style Compliance**: Follow existing Playwright coding standards, naming conventions, and architectural patterns
5. **Backwards Compatibility**: Support all existing locator strategies and APIs

## Integration Points with Existing Playwright Codebase

### 1. Extend Existing Locator Engine

**File: `packages/playwright-core/src/server/locators/locatorEngine.ts`**

Add self-healing capability without modifying core locator logic:

```typescript
// Add new optional interface
interface LocatorOptions {
  // ... existing options
  selfHealing?: SelfHealingConfig;
}

// Extend existing locator resolution
class LocatorEngine {
  // Wrap existing _locateElement method
  async _locateElementWithHealing(/* ... */): Promise<Element> {
    try {
      return await this._locateElement(/* ... */);
    } catch (error) {
      if (this._shouldAttemptHealing(error)) {
        return await this._attemptSelfHealing(/* ... */);
      }
      throw error;
    }
  }
}
```

### 2. Integrate with Existing Config System

**File: `packages/playwright/src/common/config.ts`**

Add configuration without breaking existing configs:

```typescript
export interface PlaywrightTestConfig {
  // ... existing config
  use?: {
    // ... existing use options
    selfHealing?: {
      enabled?: boolean;
      mode?: "auto" | "assisted" | "suggestion-only";
      autoApplyThreshold?: number;
      strategies?: Array<
        "semantic" | "text" | "visual" | "structural" | "attribute"
      >;
      storageFile?: string;
      notifyOnHeal?: boolean;
      excludeTests?: RegExp[];
    };
  };
}
```

### 3. Extend Debug Mode UI

**File: `packages/playwright-core/src/server/supplements/inspector/inspector.ts`**

Add self-healing panel to existing debug interface:

- Inject new panel alongside existing "Locator", "Source", "Call Log" tabs
- Reuse existing element highlighting infrastructure
- Leverage existing pause/resume mechanisms
- Display healing suggestions in native Playwright debug UI

### 4. Extend UI Mode

**File: `packages/playwright/src/runner/uiMode.ts`**

Add self-healing review workflow to existing UI Mode:

- New tab "Self-Healing" in the existing UI Mode interface
- Reuse existing trace viewer infrastructure for before/after comparison
- Leverage existing code editor integration for showing diffs
- Utilize existing approval/rejection patterns

## Technical Implementation

### Phase 1: Core Self-Healing Engine (Minimal Invasive)

**New Files to Add:**

```
packages/playwright-core/src/server/selfHealing/
├── healingEngine.ts          // Main healing logic
├── strategies/
│   ├── semanticStrategy.ts   // Role, label, placeholder matching
│   ├── textStrategy.ts       // Text content matching
│   ├── structuralStrategy.ts // DOM structure similarity
│   └── attributeStrategy.ts  // Attribute-based fallback
├── scoringAlgorithm.ts       // Candidate evaluation
└── suggestionStore.ts        // Persist healing suggestions
```

**Files to Modify (minimal changes):**

```
packages/playwright-core/src/server/locators/locatorEngine.ts
  + Add optional self-healing wrapper around existing methods
  + No changes to core locator logic

packages/playwright/src/common/config.ts
  + Add optional selfHealing config section
  + Maintain full backwards compatibility

packages/playwright/src/runner/testRun.ts
  + Hook into test lifecycle for healing events
  + Optional listener pattern (no breaking changes)
```

### Phase 2: Debug Mode Integration

**Extend Existing Files:**

```
packages/playwright-core/src/server/supplements/inspector/inspector.ts
  + Register new "Self-Healing" panel
  + Reuse existing highlight/pause infrastructure

packages/playwright-core/src/server/supplements/inspector/recorderApp.tsx
  + Add React component for healing suggestions panel
  + Follow existing UI patterns and styling
```

**New Component Structure:**

```typescript
// Follows existing Playwright inspector patterns
interface SelfHealingPanel {
  // Display failed locator with context
  originalLocator: string;
  failureContext: {
    testName: string;
    lineNumber: number;
    screenshot: string;
  };

  // Show candidates with existing highlight system
  candidates: Array<{
    locator: string;
    score: number;
    reasoning: string;
    element: ElementHandle; // Uses existing ElementHandle
  }>;

  // Actions using existing inspector controls
  actions: {
    approve: (candidate: Candidate) => void;
    reject: () => void;
    editManually: () => void;
  };
}
```

### Phase 3: UI Mode Integration

**Extend Existing Files:**

```
packages/trace-viewer/src/ui/workbench.tsx
  + Add "Self-Healing" tab to existing workbench
  + Reuse trace viewer components for comparison

packages/trace-viewer/src/ui/modelUtil.ts
  + Add healing events to trace model
  + Backwards compatible trace format
```

**Implementation Pattern:**

```typescript
// Extend existing ActionTraceEvent
interface HealingTraceEvent extends ActionTraceEvent {
  type: "locator-healed";
  originalLocator: string;
  healedLocator: string;
  score: number;
  strategy: string;
  applied: boolean;
}
```

### Phase 4: Code Modification System

**New Utility (Non-Breaking):**

```
packages/playwright/src/runner/codegen/
├── codeModifier.ts          // AST-based test file updates
└── locatorReplacer.ts       // Safe locator replacement
```

**Safe Modification Rules:**

- Never modify code without explicit approval (except in auto mode with high confidence)
- Create git-compatible diffs
- Preserve all comments and formatting
- Maintain test structure and logic
- Backup original files before modification

## API Design (Backwards Compatible)

### Existing API - No Changes Required

```typescript
// All existing code continues to work exactly as before
await page.locator("button").click(); // Works as always
```

### New Opt-in API

```typescript
// Explicit opt-in for self-healing
import { test, expect } from "@playwright/test";

test.use({
  selfHealing: { enabled: true, mode: "assisted" },
});

test("with self-healing", async ({ page }) => {
  // Same code, but with healing fallback
  await page.locator('[data-testid="submit"]').click();
});
```

### Programmatic API (New, Non-Breaking)

```typescript
// New exports that don't affect existing imports
import {
  getSelfHealingSuggestions,
  applySuggestion,
} from "@playwright/test/healing";

const suggestions = await getSelfHealingSuggestions(page, "button.old-class");
await applySuggestion({
  testFile: "tests/login.spec.ts",
  line: 42,
  newLocator: "button.new-class",
});
```

## Configuration Examples

### Minimal Configuration (Feature Disabled)

```typescript
// playwright.config.ts
export default defineConfig({
  // No changes needed - feature is opt-in
});
```

### Basic Configuration (Auto Mode)

```typescript
export default defineConfig({
  use: {
    selfHealing: {
      enabled: true,
      mode: "auto",
      autoApplyThreshold: 90,
    },
  },
});
```

### Advanced Configuration (Full Control)

```typescript
export default defineConfig({
  use: {
    selfHealing: {
      enabled: true,
      mode: "assisted", // Requires manual approval in debug mode

      // Scoring and strategies
      autoApplyThreshold: 85,
      strategies: ["semantic", "text", "structural", "attribute"],

      // Storage and reporting
      storageFile: ".playwright/self-healing-suggestions.json",
      notifyOnHeal: true,

      // Exclusions
      excludeTests: [/\.visual\.spec\.ts$/],

      // Learning mode (improves over time)
      learnFromManualSelections: true,
    },
  },
});
```

## Workflow Integration

### Workflow 1: Auto Mode (Silent Healing)

```
1. Test executes: await page.locator('.old-selector').click()
2. Locator fails (TimeoutError)
3. Self-healing activates:
   - Analyzes DOM structure
   - Finds candidates using strategies
   - Scores candidates (0-100)
4. If top candidate score >= 90:
   - Applies healed locator
   - Test continues successfully
   - Logs healing event to trace
5. Post-test:
   - Suggestion saved to .playwright/self-healing-suggestions.json
   - Developer reviews in UI Mode later
```

### Workflow 2: Assisted Mode (Interactive Debug)

```
1. Run: npx playwright test --debug
2. Test fails on locator
3. Debug mode pauses with new "Self-Healing" panel:
   ┌─────────────────────────────────────────┐
   │ ❌ Locator Failed                       │
   │ Original: [data-testid="old-button"]    │
   │                                         │
   │ 🔍 Found 3 candidates:                  │
   │                                         │
   │ ✓ button[aria-label="Submit"] (92)     │
   │   - Semantic match: high               │
   │   - Position: similar                  │
   │   [Highlight] [Approve]                │
   │                                         │
   │ ○ button.submit-btn (84)               │
   │   - Structural match: medium           │
   │   [Highlight] [Approve]                │
   │                                         │
   │ ○ //button[contains(text(),'Sub')] (78)│
   │   - Text match: partial                │
   │   [Highlight] [Approve]                │
   │                                         │
   │ [Reject All] [Edit Manually]           │
   └─────────────────────────────────────────┘
4. Developer clicks [Highlight] - element blinks on page
5. Developer clicks [Approve] on correct candidate
6. Test continues with healed locator
7. Option to save change to test file
```

### Workflow 3: UI Mode Review

```
1. Run: npx playwright test --ui
2. After test run, click "Self-Healing" tab
3. Interface shows:
   ┌─────────────────────────────────────────┐
   │ Self-Healing Report                     │
   │                                         │
   │ ✅ 5 Auto-Applied (confidence > 90)     │
   │ ⚠️  3 Require Review (confidence 70-89) │
   │ ❌ 1 Failed to Heal (confidence < 70)   │
   │                                         │
   │ [Show Details]                          │
   └─────────────────────────────────────────┘
4. Click on suggestion:
   ┌─────────────────────────────────────────┐
   │ tests/login.spec.ts:42                  │
   │                                         │
   │ Before:                    After:       │
   │ ┌──────────────┐          ┌──────────┐ │
   │ │ .old-btn     │    →     │ button   │ │
   │ │              │          │ [role=   │ │
   │ │              │          │ "button"]│ │
   │ └──────────────┘          └──────────┘ │
   │                                         │
   │ Score: 92 | Strategy: Semantic         │
   │                                         │
   │ [View Screenshot] [View Code Diff]     │
   │ [Approve] [Reject] [Edit]              │
   └─────────────────────────────────────────┘
5. Click [Approve] - code is updated
6. Git diff shows clean, reviewable change
```

## Success Metrics

**Accuracy:**

- 85%+ of auto-applied locators are correct
- <5% false positives requiring rollback

**Coverage:**

- Finds alternative for 90%+ of locator failures
- Supports all Playwright locator types (CSS, XPath, text, role, etc.)

**Performance:**

- <200ms overhead per locator attempt
- <50ms when healing is disabled (zero impact)
- Trace file size increase <10%

**Developer Experience:**

- Review and approve suggestion in <30 seconds
- Zero configuration required for basic usage
- Clear, actionable console output

**Compatibility:**

- Works with Playwright 1.40+
- No breaking changes to existing APIs
- Compatible with all test frameworks (test runner, Jest, Mocha, etc.)

## Implementation Phases for PR

### PR 1: Foundation (Core Engine)

**Changes:**

- Add `packages/playwright-core/src/server/selfHealing/` directory
- Minimal modifications to locator engine (wrapper only)
- Add configuration schema
- Add basic console logging
- Include comprehensive tests
- Update documentation

**Testing:**

- Unit tests for each strategy
- Integration tests with real DOM
- Performance benchmarks
- Backwards compatibility tests

### PR 2: Debug Mode Integration

**Changes:**

- Extend inspector with self-healing panel
- Add React components following existing patterns
- Integrate with existing highlight system
- Add interactive approval workflow

**Testing:**

- E2E tests for debug mode
- UI component tests
- Accessibility tests

### PR 3: UI Mode Integration

**Changes:**

- Extend trace viewer with healing tab
- Add healing events to trace format
- Implement side-by-side comparison view
- Add code modification capability

**Testing:**

- E2E tests for UI mode workflow
- Trace compatibility tests
- Code modification safety tests

### PR 4: Advanced Features & Polish

**Changes:**

- Visual similarity detection
- Learning mode (improve scoring from feedback)
- Comprehensive reporting
- Performance optimizations

**Testing:**

- Stress tests with large test suites
- Cross-browser compatibility
- Production scenario validation

## Safety and Security

**Code Modification Safety:**

- Never modify code without explicit approval (except auto mode with confidence > threshold)
- Create atomic git commits for each modification
- Backup original test files
- AST-based modifications (preserve formatting)
- Rollback capability

**Data Privacy:**

- No external API calls
- All processing local
- No telemetry without opt-in
- Respect .gitignore for suggestions file

**Backwards Compatibility Guarantees:**

- Feature disabled by default
- No changes to existing public APIs
- Graceful degradation if errors occur
- Clear migration path for future versions

## Documentation Requirements

**For PR Submission:**

1. **RFC Document** (packages/playwright/docs/rfcs/self-healing.md)

   - Motivation and use cases
   - Technical design
   - Migration guide
   - Performance impact

2. **API Documentation** (packages/playwright/docs/src/test-api/self-healing.md)

   - Configuration options
   - Programmatic API
   - Examples

3. **User Guide** (packages/playwright/docs/src/test-self-healing.md)

   - Getting started
   - Workflow examples
   - Best practices
   - Troubleshooting

4. **Code Comments**

   - TSDoc for all public APIs
   - Implementation notes for complex algorithms
   - Examples in code comments

5. **CHANGELOG Entry**
   - Feature description
   - Breaking changes (none expected)
   - Migration steps (if any)

## Example PR Description

```markdown
# Add Self-Healing Capability for Test Locators

## Summary

Adds optional self-healing functionality that automatically finds alternative locators when tests fail due to UI changes. Feature is disabled by default and fully backwards compatible.

## Motivation

- Reduce test maintenance burden when UI changes
- Provide transparency into locator failures
- Maintain test coverage during refactoring

## Changes

- ✅ Zero breaking changes
- ✅ Opt-in configuration
- ✅ Debug mode integration
- ✅ UI mode integration
- ✅ Comprehensive tests
- ✅ Full documentation

## Testing

- 150+ new unit tests
- 25+ integration tests
- Performance benchmarks (no regression)
- Backwards compatibility validated

## Documentation

- RFC with technical design
- API documentation
- User guide with examples
- Migration guide

## Checklist

- [x] Tests pass
- [x] Documentation complete
- [x] Backwards compatible
- [x] Performance validated
- [x] Accessibility verified
- [x] Security reviewed
```

## Code Style Guidelines

**Follow Existing Playwright Patterns:**

1. **Naming Conventions:**

   - Use existing naming patterns (e.g., `_privateMethod`, `publicMethod`)
   - Match existing file naming (camelCase for files)

2. **Error Handling:**

   - Use existing error classes (`TimeoutError`, `TargetClosedError`)
   - Follow existing error message format

3. **Async Patterns:**

   - Use existing async/await patterns
   - Respect existing timeout mechanisms

4. **Testing:**

   - Use existing test framework structure
   - Follow existing test naming conventions
   - Reuse existing test fixtures

5. **Documentation:**
   - Match existing TSDoc format
   - Follow existing example patterns
   - Use consistent terminology

## Success Criteria for PR Acceptance

- [ ] All existing tests pass
- [ ] New tests have 100% coverage of new code
- [ ] Performance benchmarks show <5% overhead when disabled
- [ ] Documentation is complete and accurate
- [ ] Code review approved by Playwright maintainers
- [ ] RFC discussion resolved
- [ ] Zero breaking changes confirmed
- [ ] Accessibility verified
- [ ] Security review passed

## Detailed Feature Specifications

### 1. Locator Healing Strategies

#### 1.1 Semantic Strategy (Highest Priority)

**Goal:** Find elements using accessibility attributes and semantic HTML

**Implementation:**

```typescript
class SemanticStrategy implements HealingStrategy {
  async findCandidates(context: HealingContext): Promise<Candidate[]> {
    const candidates = [];

    // Try ARIA role
    if (context.originalElement?.role) {
      candidates.push(await this.findByRole(context.originalElement.role));
    }

    // Try ARIA label
    if (context.originalElement?.ariaLabel) {
      candidates.push(
        await this.findByLabel(context.originalElement.ariaLabel)
      );
    }

    // Try placeholder
    if (context.originalElement?.placeholder) {
      candidates.push(
        await this.findByPlaceholder(context.originalElement.placeholder)
      );
    }

    // Try title attribute
    if (context.originalElement?.title) {
      candidates.push(await this.findByTitle(context.originalElement.title));
    }

    return candidates;
  }

  calculateScore(candidate: Element, original: Element): number {
    let score = 0;

    // Exact role match: +40 points
    if (candidate.role === original.role) score += 40;

    // Exact label match: +30 points
    if (candidate.ariaLabel === original.ariaLabel) score += 30;

    // Similar text content: +20 points
    if (
      this.textSimilarity(candidate.textContent, original.textContent) > 0.8
    ) {
      score += 20;
    }

    // Same position (±50px): +10 points
    if (this.positionSimilarity(candidate, original) > 0.9) score += 10;

    return Math.min(score, 100);
  }
}
```

#### 1.2 Text Strategy

**Goal:** Find elements by text content matching

**Implementation:**

```typescript
class TextStrategy implements HealingStrategy {
  async findCandidates(context: HealingContext): Promise<Candidate[]> {
    const text = context.originalElement?.textContent?.trim();
    if (!text) return [];

    const candidates = [];

    // Exact text match
    candidates.push(...(await page.getByText(text, { exact: true }).all()));

    // Partial text match
    candidates.push(...(await page.getByText(text, { exact: false }).all()));

    // Case-insensitive match
    candidates.push(...(await page.getByText(new RegExp(text, "i")).all()));

    return candidates;
  }

  calculateScore(candidate: Element, original: Element): number {
    const similarity = this.levenshteinSimilarity(
      candidate.textContent,
      original.textContent
    );

    return Math.round(similarity * 100);
  }
}
```

#### 1.3 Visual Strategy

**Goal:** Find elements with similar visual appearance and position

**Implementation:**

```typescript
class VisualStrategy implements HealingStrategy {
  async findCandidates(context: HealingContext): Promise<Candidate[]> {
    const originalBox = await context.originalElement?.boundingBox();
    if (!originalBox) return [];

    // Find all elements near the original position
    const candidates = await page.evaluate((box) => {
      const elements = document.querySelectorAll("*");
      const nearby = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const distance = Math.sqrt(
          Math.pow(rect.x - box.x, 2) + Math.pow(rect.y - box.y, 2)
        );

        if (distance < 100) {
          // Within 100px
          nearby.push(el);
        }
      }

      return nearby;
    }, originalBox);

    return candidates;
  }

  calculateScore(candidate: Element, original: Element): number {
    let score = 0;

    // Position similarity: 40 points
    const posSim = this.positionSimilarity(candidate, original);
    score += posSim * 40;

    // Size similarity: 30 points
    const sizeSim = this.sizeSimilarity(candidate, original);
    score += sizeSim * 30;

    // Visual style similarity: 30 points
    const styleSim = this.styleSimilarity(candidate, original);
    score += styleSim * 30;

    return Math.round(score);
  }

  private styleSimilarity(a: Element, b: Element): number {
    const styleA = window.getComputedStyle(a);
    const styleB = window.getComputedStyle(b);

    let matches = 0;
    let total = 0;

    const properties = ["color", "backgroundColor", "fontSize", "fontWeight"];

    for (const prop of properties) {
      total++;
      if (styleA[prop] === styleB[prop]) matches++;
    }

    return matches / total;
  }
}
```

#### 1.4 Structural Strategy

**Goal:** Find elements with similar DOM structure

**Implementation:**

```typescript
class StructuralStrategy implements HealingStrategy {
  async findCandidates(context: HealingContext): Promise<Candidate[]> {
    const original = context.originalElement;
    if (!original) return [];

    // Build structural signature
    const signature = this.buildSignature(original);

    // Find elements with similar structure
    const candidates = await page.evaluate((sig) => {
      const elements = document.querySelectorAll(sig.tagName);
      return Array.from(elements).filter((el) => {
        return el.className.split(" ").some((c) => sig.classes.includes(c));
      });
    }, signature);

    return candidates;
  }

  private buildSignature(element: Element) {
    return {
      tagName: element.tagName.toLowerCase(),
      classes: Array.from(element.classList),
      attributes: Array.from(element.attributes).map((a) => ({
        name: a.name,
        value: a.value,
      })),
      parentTag: element.parentElement?.tagName.toLowerCase(),
      depth: this.getDepth(element),
    };
  }

  calculateScore(candidate: Element, original: Element): number {
    const candSig = this.buildSignature(candidate);
    const origSig = this.buildSignature(original);

    let score = 0;

    // Same tag: +20 points
    if (candSig.tagName === origSig.tagName) score += 20;

    // Shared classes: +30 points
    const sharedClasses = candSig.classes.filter((c) =>
      origSig.classes.includes(c)
    );
    score += (sharedClasses.length / origSig.classes.length) * 30;

    // Same parent: +20 points
    if (candSig.parentTag === origSig.parentTag) score += 20;

    // Similar depth: +15 points
    const depthDiff = Math.abs(candSig.depth - origSig.depth);
    score += Math.max(0, 15 - depthDiff * 3);

    // Shared attributes: +15 points
    const sharedAttrs = candSig.attributes.filter((a) =>
      origSig.attributes.some((oa) => oa.name === a.name)
    );
    score += (sharedAttrs.length / origSig.attributes.length) * 15;

    return Math.round(score);
  }
}
```

### 2. Scoring Algorithm

**Combined Score Calculation:**

```typescript
class ScoringAlgorithm {
  calculateFinalScore(
    candidate: Candidate,
    strategyScores: Map<string, number>
  ): number {
    // Weight by strategy priority
    const weights = {
      semantic: 0.35,
      text: 0.25,
      visual: 0.2,
      structural: 0.2,
    };

    let weightedScore = 0;
    let totalWeight = 0;

    for (const [strategy, score] of strategyScores) {
      const weight = weights[strategy] || 0;
      weightedScore += score * weight;
      totalWeight += weight;
    }

    const baseScore = weightedScore / totalWeight;

    // Apply confidence modifiers
    const modifiers = this.getConfidenceModifiers(candidate);
    const finalScore = baseScore * modifiers.multiplier + modifiers.bonus;

    return Math.min(Math.max(finalScore, 0), 100);
  }

  private getConfidenceModifiers(candidate: Candidate) {
    let multiplier = 1.0;
    let bonus = 0;

    // Bonus for stable attributes
    if (candidate.hasTestId) bonus += 10;
    if (candidate.hasId) bonus += 5;
    if (candidate.hasAriaLabel) bonus += 5;

    // Penalty for dynamic classes
    if (candidate.hasDynamicClasses) multiplier *= 0.9;

    // Penalty for multiple matches
    if (candidate.duplicateCount > 1) {
      multiplier *= 1 / candidate.duplicateCount;
    }

    return { multiplier, bonus };
  }
}
```

### 3. Healing Engine Core

```typescript
class HealingEngine {
  private strategies: HealingStrategy[];
  private config: SelfHealingConfig;

  constructor(config: SelfHealingConfig) {
    this.config = config;
    this.strategies = this.initializeStrategies(config.strategies);
  }

  async attemptHealing(
    page: Page,
    failedLocator: string,
    context: HealingContext
  ): Promise<HealingResult> {
    // Capture current state
    const snapshot = await this.captureSnapshot(page);

    // Run all strategies in parallel
    const candidateGroups = await Promise.all(
      this.strategies.map((s) => s.findCandidates(context))
    );

    // Flatten and deduplicate candidates
    const uniqueCandidates = this.deduplicateCandidates(candidateGroups.flat());

    // Score all candidates
    const scoredCandidates = await this.scoreCandidates(
      uniqueCandidates,
      context
    );

    // Sort by score
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Apply healing based on mode
    const result = await this.applyHealing(
      page,
      failedLocator,
      scoredCandidates,
      snapshot
    );

    // Log and store
    await this.logHealingAttempt(result);

    return result;
  }

  private async applyHealing(
    page: Page,
    original: string,
    candidates: ScoredCandidate[],
    snapshot: Snapshot
  ): Promise<HealingResult> {
    const best = candidates[0];

    if (!best) {
      return {
        success: false,
        reason: "No candidates found",
      };
    }

    switch (this.config.mode) {
      case "auto":
        if (best.score >= this.config.autoApplyThreshold) {
          return {
            success: true,
            appliedLocator: best.locator,
            score: best.score,
            strategy: best.strategy,
            autoApplied: true,
          };
        }
        return {
          success: false,
          reason: "Score below threshold",
          suggestions: candidates,
        };

      case "assisted":
        // Pause and show debug panel
        await this.showDebugPanel(page, original, candidates);
        const userChoice = await this.waitForUserDecision();

        return {
          success: userChoice.approved,
          appliedLocator: userChoice.selectedLocator,
          score: userChoice.score,
          userApproved: true,
        };

      case "suggestion-only":
        return {
          success: false,
          suggestions: candidates,
        };
    }
  }
}
```

### 4. Debug Panel UI

```typescript
// React component for debug mode
function SelfHealingDebugPanel({
  originalLocator,
  candidates,
  onApprove,
  onReject,
}: SelfHealingDebugPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState(null);

  const handleHighlight = async (candidate: Candidate) => {
    // Reuse Playwright's existing highlight system
    await window.playwright.highlight(candidate.element);
    setHighlightedElement(candidate);
  };

  const handleApprove = async () => {
    const candidate = candidates[selectedIndex];
    await onApprove(candidate);
  };

  return (
    <div className="self-healing-panel">
      <div className="header">
        <ErrorIcon />
        <h3>Locator Failed</h3>
      </div>

      <div className="original-locator">
        <label>Original:</label>
        <code>{originalLocator}</code>
      </div>

      <div className="candidates-list">
        <h4>Found {candidates.length} candidates:</h4>

        {candidates.map((candidate, idx) => (
          <CandidateItem
            key={idx}
            candidate={candidate}
            isSelected={idx === selectedIndex}
            onSelect={() => setSelectedIndex(idx)}
            onHighlight={() => handleHighlight(candidate)}
          />
        ))}
      </div>

      <div className="actions">
        <button onClick={handleApprove} className="btn-primary">
          Approve Selected
        </button>
        <button onClick={onReject} className="btn-secondary">
          Reject All
        </button>
        <button
          onClick={() => {
            /* open editor */
          }}
          className="btn-secondary"
        >
          Edit Manually
        </button>
      </div>
    </div>
  );
}

function CandidateItem({ candidate, isSelected, onSelect, onHighlight }) {
  return (
    <div
      className={`candidate ${isSelected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="candidate-header">
        <ScoreBar score={candidate.score} />
        <code>{candidate.locator}</code>
      </div>

      <div className="candidate-details">
        <div className="strategy">
          Strategy: <strong>{candidate.strategy}</strong>
        </div>
        <div className="reasoning">{candidate.reasoning}</div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onHighlight();
        }}
        className="btn-highlight"
      >
        Highlight on Page
      </button>
    </div>
  );
}
```

### 5. UI Mode Extension

```typescript
// Extend trace viewer with self-healing tab
function SelfHealingTraceTab({ trace }: { trace: Trace }) {
  const healingEvents = useMemo(() => {
    return trace.events.filter((e) => e.type === "locator-healed");
  }, [trace]);

  const stats = useMemo(
    () => ({
      autoApplied: healingEvents.filter((e) => e.autoApplied).length,
      requiresReview: healingEvents.filter(
        (e) => e.score >= 70 && e.score < 90 && !e.applied
      ).length,
      failed: healingEvents.filter((e) => e.score < 70).length,
    }),
    [healingEvents]
  );

  return (
    <div className="self-healing-trace-tab">
      <div className="summary">
        <StatCard
          title="Auto-Applied"
          count={stats.autoApplied}
          type="success"
        />
        <StatCard
          title="Requires Review"
          count={stats.requiresReview}
          type="warning"
        />
        <StatCard title="Failed to Heal" count={stats.failed} type="error" />
      </div>

      <div className="events-list">
        {healingEvents.map((event, idx) => (
          <HealingEventItem key={idx} event={event} trace={trace} />
        ))}
      </div>
    </div>
  );
}

function HealingEventItem({ event, trace }) {
  const [expanded, setExpanded] = useState(false);

  const handleApprove = async () => {
    await applyHealingToCode({
      testFile: event.testFile,
      line: event.line,
      oldLocator: event.originalLocator,
      newLocator: event.healedLocator,
    });
  };

  return (
    <div className="healing-event">
      <div className="event-header" onClick={() => setExpanded(!expanded)}>
        <StatusIcon status={event.status} />
        <span className="test-name">{event.testName}</span>
        <span className="location">
          {event.testFile}:{event.line}
        </span>
        <ScoreBadge score={event.score} />
      </div>

      {expanded && (
        <div className="event-details">
          <div className="locator-comparison">
            <div className="before">
              <h5>Before</h5>
              <code>{event.originalLocator}</code>
              <ScreenshotViewer
                screenshot={event.beforeScreenshot}
                highlight={event.originalElement}
              />
            </div>

            <div className="arrow">→</div>

            <div className="after">
              <h5>After</h5>
              <code>{event.healedLocator}</code>
              <ScreenshotViewer
                screenshot={event.afterScreenshot}
                highlight={event.healedElement}
              />
            </div>
          </div>

          <div className="code-diff">
            <CodeDiffViewer
              before={event.codeBefore}
              after={event.codeAfter}
              file={event.testFile}
              line={event.line}
            />
          </div>

          <div className="event-actions">
            {!event.applied && (
              <button onClick={handleApprove} className="btn-approve">
                Approve & Apply
              </button>
            )}
            <button className="btn-secondary">View Full Context</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 6. Code Modification System

```typescript
class CodeModifier {
  async applyLocatorChange(options: {
    testFile: string;
    line: number;
    oldLocator: string;
    newLocator: string;
  }): Promise<ModificationResult> {
    // Read file
    const content = await fs.readFile(options.testFile, "utf-8");

    // Parse AST
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });

    // Find the specific locator call
    let modified = false;

    traverse(ast, {
      CallExpression(path) {
        // Check if this is a locator call on the target line
        if (
          path.node.loc.start.line === options.line &&
          this.isLocatorCall(path.node)
        ) {
          // Replace the locator string
          const args = path.node.arguments;
          if (args[0]?.type === "StringLiteral") {
            if (args[0].value === options.oldLocator) {
              args[0].value = options.newLocator;
              modified = true;
            }
          }
        }
      },
    });

    if (!modified) {
      throw new Error("Could not find locator to replace");
    }

    // Generate new code
    const output = generate(ast, {
      retainLines: true,
      retainFunctionParens: true,
    });

    // Create backup
    await this.createBackup(options.testFile);

    // Write new content
    await fs.writeFile(options.testFile, output.code, "utf-8");

    return {
      success: true,
      file: options.testFile,
      changes: [
        {
          line: options.line,
          before: options.oldLocator,
          after: options.newLocator,
        },
      ],
    };
  }

  private isLocatorCall(node: CallExpression): boolean {
    // Check if it's page.locator(), page.getByRole(), etc.
    if (node.callee.type !== "MemberExpression") return false;

    const methodName = node.callee.property.name;
    const locatorMethods = [
      "locator",
      "getByRole",
      "getByText",
      "getByLabel",
      "getByPlaceholder",
      "getByTestId",
      "getByTitle",
    ];

    return locatorMethods.includes(methodName);
  }

  private async createBackup(file: string): Promise<void> {
    const backupDir = path.join(path.dirname(file), ".playwright-backups");

    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const backupFile = path.join(
      backupDir,
      `${path.basename(file)}.${timestamp}.backup`
    );

    await fs.copyFile(file, backupFile);
  }
}
```

### 7. Storage and Reporting

```typescript
class SuggestionStore {
  private storageFile: string;

  async saveSuggestion(suggestion: HealingSuggestion): Promise<void> {
    const existing = await this.load();

    existing.suggestions.push({
      ...suggestion,
      timestamp: new Date().toISOString(),
      id: this.generateId(),
    });

    await this.save(existing);
  }

  async load(): Promise<SuggestionStorage> {
    try {
      const content = await fs.readFile(this.storageFile, "utf-8");
      return JSON.parse(content);
    } catch {
      return { suggestions: [], version: 1 };
    }
  }

  async generateReport(): Promise<HealingReport> {
    const storage = await this.load();

    return {
      totalHealing: storage.suggestions.length,
      autoApplied: storage.suggestions.filter((s) => s.autoApplied).length,
      requiresReview: storage.suggestions.filter(
        (s) => !s.applied && s.score >= 70
      ).length,
      failed: storage.suggestions.filter((s) => s.score < 70).length,

      byStrategy: this.groupByStrategy(storage.suggestions),
      byTest: this.groupByTest(storage.suggestions),

      averageScore: this.calculateAverageScore(storage.suggestions),

      suggestions: storage.suggestions.map((s) => ({
        testFile: s.testFile,
        line: s.line,
        original: s.originalLocator,
        suggested: s.suggestedLocator,
        score: s.score,
        strategy: s.strategy,
        applied: s.applied,
        timestamp: s.timestamp,
      })),
    };
  }
}
```

## Final Notes

Create this implementation with a focus on:

1. **Minimal disruption** - Zero breaking changes, opt-in only
2. **Maximum compatibility** - Works with all existing Playwright features
3. **Excellent developer experience** - Clear, intuitive, helpful
4. **Production ready** - Safe, tested, performant
5. **Natural extension** - Feels like native Playwright feature

The feature should seamlessly integrate into Playwright's existing architecture while providing powerful self-healing capabilities that reduce test maintenance burden and improve test reliability.
