# 📋 UPDATED Remaining Tasks List for Playwright Self-Healing PR

**Analysis Date:** Based on latest code from PR #3 (5 commits)  
**Completion Percentage:** ~65-70% (significantly increased from 45-50%)

---

## ✅ WHAT'S IMPLEMENTED (Major Updates)

### Fully Implemented:

1. ✅ Core Healing Engine (healingEngine.ts, scoringAlgorithm.ts)
2. ✅ Suggestion Store (suggestionStore.ts)
3. ✅ Self Healing Wrapper (selfHealingWrapper.ts) **WITH RETRY LOGIC**
4. ✅ 4 strategies: Semantic, Text, Structural, Attribute
5. ✅ Debug Mode UI Panel (SelfHealingPanel.tsx + CSS)
6. ✅ Trace Viewer Integration (SelfHealingTab.tsx + CSS)
7. ✅ TypeScript types for configuration
8. ✅ Configuration integration (playwright.config.ts)
9. ✅ Recorder integration (recorderApp.ts, recorder.tsx)
10. ✅ **NEW: Locator Engine Integration (frameSelectors.ts)**
11. ✅ **NEW: Screenshot Capture in healingEngine.ts**
12. ✅ **NEW: Real Trace Event Recording (no more mock data!)**
13. ✅ **NEW: Healing retry mechanism with validation**

---

## 🎉 RECENT IMPROVEMENTS (Latest PR)

### ✅ Task 1: Locator Engine Integration - NOW IMPLEMENTED

**Location:** `packages/playwright-core/src/server/frameSelectors.ts`

**What was added:**

```typescript
// lines 40-83
export class FrameSelectors {
  private _selfHealingWrapper?: SelfHealingWrapper;

  constructor(frame: Frame) {
    this.frame = frame;
    // Initialize self-healing wrapper if available
    try {
      this._selfHealingWrapper = new SelfHealingWrapper(
        frame._page.browserContext
      );
    } catch (e) {
      // Self-healing is optional, continue without it
    }
  }

  async query(
    selector: string,
    options?,
    scope?
  ): Promise<ElementHandle<Element> | null> {
    // If self-healing is enabled, wrap the query with healing logic
    if (this._selfHealingWrapper?.isEnabled()) {
      return await this._selfHealingWrapper.wrapSelectorResolution(
        this.frame,
        selector,
        async () => await this._performQuery(selector, options, scope),
        { progress, testName, lineNumber }
      );
    }
    // Fallback to direct query
    return await this._performQuery(selector, options, scope);
  }
}
```

**Status:** ✅ COMPLETE - Self-healing now intercepts ALL selector queries!

---

### ✅ Task 3: Screenshot Capture - NOW IMPLEMENTED

**Location:** `packages/playwright-core/src/server/selfHealing/healingEngine.ts`

**What was added:**

```typescript
// lines 186-212
private async captureSnapshot(page: Page): Promise<any> {
  try {
    let screenshot: string | undefined;
    try {
      const progress = { log: () => {}, cleanupWhenAborted: () => {}, throwIfAborted: () => {} } as any;
      const screenshotBuffer = await page.screenshot(progress, {});
      screenshot = screenshotBuffer.toString('base64'); // ✅ NOW CAPTURES SCREENSHOT
    } catch (screenshotError) {
      console.warn('[Self-Healing] Screenshot capture failed:', screenshotError.message);
    }

    return {
      url: page.mainFrame().url(),
      title: await page.mainFrame().title(),
      timestamp: Date.now(),
      screenshot // ✅ INCLUDED
    };
  } catch (error) {
    return { url: 'unknown', title: 'unknown', timestamp: Date.now(), screenshot: undefined };
  }
}
```

**Status:** ✅ COMPLETE - Screenshots are now captured during healing events!

---

### ⚠️ Task 2: Healing Application Logic - SIGNIFICANTLY IMPROVED

**Location:** `packages/playwright-core/src/server/selfHealing/selfHealingWrapper.ts`

**What was added:**

```typescript
// lines 49-153
async wrapSelectorResolution<R>(frame, originalSelector, action, context): Promise<R> {
  if (!this.isEnabled() || !this.healingEngine) {
    return await action(); // Original action if healing disabled
  }

  try {
    return await action(); // First, try the original selector
  } catch (originalError) {
    if (!this.shouldAttemptHealing(originalError)) {
      throw originalError;
    }

    // Attempt healing
    const healingResult = await this.attemptHealing(frame._page, originalSelector, context);

    if (healingResult.success && healingResult.appliedLocator) {
      // ✅ NOW VALIDATES THE HEALED LOCATOR
      try {
        const frameSelectors = new (require('./frameSelectors').FrameSelectors)(frame);
        const testResult = await frameSelectors._performQuery(healingResult.appliedLocator);

        if (testResult) {
          // ✅ SUCCESS - Store healing event
          await this.recordHealingEvent({
            originalLocator: originalSelector,
            healedLocator: healingResult.appliedLocator,
            score: healingResult.score || 0,
            strategy: healingResult.strategy || 'unknown',
            applied: true,
            autoApplied: (healingResult.score || 0) >= (this.config?.autoApplyThreshold || 90),
            testName: context.testName,
            timestamp: Date.now()
          });

          // Attach healing info to original error
          (originalError as any).selfHealingResult = {
            success: true,
            healedLocator: healingResult.appliedLocator,
            score: healingResult.score || 0,
            strategy: healingResult.strategy || 'unknown'
          };
        }
      } catch (healedError) {
        // Healed selector also failed
      }
    }

    throw originalError;
  }
}
```

**Status:** ⚠️ PARTIAL - Validation works, but healing doesn't truly retry the action with new locator

**Remaining Issue:**

- Healing validates that the new locator works
- Records the healing event
- BUT: Still throws the original error instead of succeeding with healed locator
- **To fix:** Need to actually return the result from the healed action instead of throwing error

---

### ✅ Task 7: Trace Event Recording - NOW IMPLEMENTED

**Location:** `packages/trace-viewer/src/ui/selfHealingTab.tsx`

**What was changed:**

```typescript
// BEFORE (lines 45-105 in old version):
export function useSelfHealingTabModel(model) {
  // For now, we'll create mock data since the healing events aren't integrated yet
  const mockEvents: HealingTraceEvent[] = [
    // ❌ HARDCODED MOCK DATA
  ];
  return { healingEvents: mockEvents };
}

// AFTER (lines 47-86 in new version):
export function useSelfHealingTabModel(model) {
  return React.useMemo(() => {
    if (!model) return { healingEvents: [] };

    const realHealingEvents: HealingTraceEvent[] = [];

    // ✅ Extract real healing events from trace model
    if (model.pages) {
      for (const page of model.pages) {
        const pageEvents = (page as any)._selfHealingEvents || [];
        for (const event of pageEvents) {
          if (event.type === "locator-healed") {
            realHealingEvents.push({
              type: "locator-healed",
              originalLocator: event.originalLocator,
              healedLocator: event.healedLocator,
              score: event.score,
              strategy: event.strategy,
              applied: event.applied,
              autoApplied: event.autoApplied,
              testName: event.testName,
              lineNumber: event.lineNumber,
              timestamp: event.timestamp,
              actionId: event.actionId,
            });
          }
        }
      }
    }

    return { healingEvents: realHealingEvents };
  }, [model]);
}
```

**Status:** ✅ COMPLETE - Trace viewer now shows REAL healing events!

---

## 🔴 REMAINING CRITICAL TASKS (Blocking merge)

### 1. Healing Retry Logic - INCOMPLETE ⚠️

**Problem:** Healing validates new locator but doesn't actually use it to succeed the test

**Current behavior:**

1. ✅ Original action fails
2. ✅ Healing finds alternative locator
3. ✅ Validates alternative locator works
4. ❌ Still throws original error (test fails)

**Required:** Test should SUCCEED when healed locator works

**Fix needed in `selfHealingWrapper.ts`:**

```typescript
async wrapSelectorResolution<R>(frame, originalSelector, action, context): Promise<R> {
  try {
    return await action();
  } catch (originalError) {
    const healingResult = await this.attemptHealing(...);

    if (healingResult.success && healingResult.appliedLocator) {
      // ✅ Validate healed locator
      const element = await frame.locator(healingResult.appliedLocator).first();

      if (element) {
        // ❌ MISSING: Actually RETRY the action with the new element
        // Instead of throwing error, we should:
        // 1. Replace the selector in the calling context
        // 2. Return the element as if original query succeeded
        // 3. Let the test continue successfully

        return element as R; // ⚠️ This is simplified - needs proper implementation
      }
    }

    throw originalError; // ❌ Currently always throws
  }
}
```

**Priority:** P0 (BLOCKER) - Core feature doesn't actually heal tests yet

---

### 2. Element Highlighting - NOT WORKING ❌

**Problem:** UI "Highlight" button exists but doesn't highlight elements

**Code:**

```typescript
// selfHealingPanel.tsx:52
onHighlight={(locator) => {
  window.dispatch({ event: 'highlightRequested', params: { selector: locator } });
}}
```

**But:** `highlightRequested` event is **NOT HANDLED** in recorderApp.ts

**Required:**

```typescript
// packages/playwright-core/src/server/recorder/recorderApp.ts
// Add after line 179:

if (data.event === "highlightRequested") {
  // Highlight the element on the page
  const selector = data.params.selector;
  await this._recorder.setHighlightedSelector(selector);
  return;
}
```

**Priority:** P1 (HIGH) - Important UX feature

---

### 3. Code Modification System - COMPLETELY MISSING ❌

**Phase 4 from PRD is completely unimplemented**

**Missing Files:**

```
packages/playwright/src/runner/codegen/
├── codeModifier.ts          ❌ MISSING
└── locatorReplacer.ts       ❌ MISSING
```

**Problem:** When user clicks "Approve" in trace viewer, nothing happens

**Required Implementation:**

1. `CodeModifier` class with AST parsing (TypeScript/JavaScript)
2. `applyHealingToCode()` function
3. Backup system for test files
4. Safe code replacement preserving formatting
5. Git integration awareness

**Priority:** P0 (BLOCKER) - Users can't apply fixes to their code

---

### 4. Visual Strategy - MISSING ❌

**From PRD:** Visual Strategy with 20% weight in scoring algorithm

**Currently:** Only 4 strategies (Semantic, Text, Structural, Attribute)

**Need to Create:**

```
packages/playwright-core/src/server/selfHealing/strategies/
└── visualStrategy.ts  ❌ MISSING
```

**Functionality:**

- Position-based similarity (±100px from original element)
- Visual style matching (color, backgroundColor, fontSize, fontWeight)
- Size similarity calculation (width, height)
- Bounding box comparison
- Z-index awareness

**Priority:** P1 (HIGH) - Important for reliable healing

---

### 5. Test Lifecycle Integration - INCOMPLETE ⚠️

**Problem:** Configuration is read but context (testName, lineNumber) is not propagated

**Current State:**

```typescript
// frameSelectors.ts:75
context: {
  progress: progress as any,
  testName: this.frame._page.mainFrame().url(), // ❌ Using URL as test name
  lineNumber: undefined // ❌ TODO: Extract from stack trace
}
```

**Required:**

- Hook into test runner to get real test name
- Extract line number from stack trace
- Pass test context through entire call chain
- Integration with `packages/playwright/src/runner/testRun.ts`

**Priority:** P1 (HIGH) - Needed for proper event tracking

---

## 🟠 HIGH PRIORITY TASKS

### 6. Edit Manually Functionality - STUB ❌

**Current:**

```typescript
// selfHealingPanel.tsx:289
onEditManually={() => {
  // Switch to locator tab for manual editing
  setSelectedTab('locator');
  setLocator(selfHealingSuggestions.originalLocator);
}}
```

**Missing:**

- Open inspector with locator pre-filled
- Position cursor at correct location
- Highlight syntax

**Priority:** P2 (MEDIUM)

---

### 7. Error Handling - INSUFFICIENT ⚠️

**Problem:** Many `catch { }` blocks with no logging

**Examples:**

```typescript
// semanticStrategy.ts, textStrategy.ts, etc.
} catch (error) {
  // Ignore errors  ❌ NO LOGGING
}
```

**Required:**

- Proper error logging with context
- Fallback strategies when one fails
- Graceful degradation
- Developer-friendly error messages

**Priority:** P2 (MEDIUM)

---

### 8. excludeTests Implementation - NOT WORKING ⚠️

**Code exists but context is missing:**

```typescript
// healingEngine.ts:134-141
if (this.config.excludeTests && context.testName) {
  for (const regex of this.config.excludeTests) {
    if (regex.test(context.testName)) {
      return { success: false, reason: "Test excluded" };
    }
  }
}
```

**Problem:** `context.testName` is URL, not actual test name

**Priority:** P2 (MEDIUM)

---

## 🟡 MEDIUM PRIORITY

### 9. Learning Mode - MISSING ❌

**Config exists:**

```typescript
learnFromManualSelections?: boolean;
```

**But no functionality:**

- No manual selections saving
- No scoring improvement based on history
- No adaptive learning

**Priority:** P3 (LOW-MEDIUM)

---

### 10. Enhanced Reporting - BASIC ⚠️

**Current:** Only basic statistics

**Missing:**

- Grouping by strategy
- Grouping by test
- HTML export
- Detailed analytics dashboard

**Priority:** P3 (LOW-MEDIUM)

---

### 11. notifyOnHeal - PARTIAL ⚠️

**Current:** Console logging only

**Missing:**

- File logging
- Webhook notifications
- Slack integration
- Custom notification handlers

**Priority:** P3 (LOW-MEDIUM)

---

## 🟢 LOW PRIORITY

### 12. Performance Optimizations - NOT VALIDATED ❌

**PRD Requirements:**

- <200ms overhead per locator
- <50ms when disabled
- Performance benchmarks

**Status:** No measurements

**Priority:** P3 (LOW)

---

### 13. Locator Type Detection - SIMPLIFIED ⚠️

**Current:** Basic regex matching

**Needs:**

- Better CSS parsing
- XPath detection
- Complex locator chain support

**Priority:** P3 (LOW)

---

### 14. Candidate Deduplication - BASIC ⚠️

**Current:** Simple string-based dedup

**Needs:**

- Semantic equivalence detection
- Score-based prioritization

**Priority:** P3 (LOW)

---

## 📚 TESTING (CRITICALLY MISSING)

### 15. Unit Tests - COMPLETELY MISSING ❌

**PRD Requirement:** 150+ unit tests

**Status:** 0 tests

**Required:**

```
packages/playwright-core/src/server/selfHealing/__tests__/
├── healingEngine.spec.ts              ❌
├── scoringAlgorithm.spec.ts           ❌
├── suggestionStore.spec.ts            ❌
├── strategies/
│   ├── semanticStrategy.spec.ts       ❌
│   ├── textStrategy.spec.ts           ❌
│   ├── structuralStrategy.spec.ts     ❌
│   └── attributeStrategy.spec.ts      ❌
└── selfHealingWrapper.spec.ts         ❌
```

**Priority:** P0 (BLOCKER FOR MERGE)

---

### 16. Integration Tests - MISSING ❌

**PRD Requirement:** 25+ integration tests

**Required:**

- Real DOM scenarios
- Multi-strategy coordination
- Cross-browser testing

**Priority:** P1 (REQUIRED FOR MERGE)

---

### 17. E2E Tests - MISSING ❌

**Required:**

- Debug mode workflow
- UI Mode workflow
- Trace viewer workflow

**Priority:** P1 (REQUIRED FOR MERGE)

---

### 18. Performance Tests - MISSING ❌

**Required:**

- Baseline measurements
- Overhead validation
- Memory leak testing

**Priority:** P2 (IMPORTANT)

---

### 19. Backwards Compatibility Tests - MISSING ❌

**Critically Important:**

- Validate zero breaking changes
- Existing tests work unchanged
- Feature flag testing

**Priority:** P0 (BLOCKER FOR MERGE)

---

## 📖 DOCUMENTATION (COMPLETELY MISSING)

### 20. RFC Document - MISSING ❌

**File:** `packages/playwright/docs/rfcs/self-healing.md`

**Priority:** P1 (REQUIRED FOR MERGE)

---

### 21. API Documentation - MISSING ❌

**File:** `packages/playwright/docs/src/test-api/self-healing.md`

**Priority:** P1 (REQUIRED FOR MERGE)

---

### 22. User Guide - MISSING ❌

**File:** `packages/playwright/docs/src/test-self-healing.md`

**Priority:** P1 (REQUIRED FOR MERGE)

---

### 23. Code Comments & TSDoc - MINIMAL ⚠️

**Current:** License headers only

**Required:**

- TSDoc for all public APIs
- Implementation notes
- Usage examples

**Priority:** P2 (IMPORTANT)

---

### 24. CHANGELOG Entry - MISSING ❌

**Required:**

- Feature description
- Configuration examples
- Known limitations

**Priority:** P1 (REQUIRED FOR MERGE)

---

## 🔧 PROGRAMMATIC API (MISSING)

### 25. Public API Exports - MISSING ❌

**Required:**

```typescript
// @playwright/test/healing
export function getSelfHealingSuggestions(
  page: Page,
  locator: string
): Promise<Suggestion[]>;
export function applySuggestion(options: ApplySuggestionOptions): Promise<void>;
export function exportReport(format: "json" | "html"): Promise<string>;
```

**Priority:** P2 (NICE TO HAVE)

---

### 26. Test Hooks API - MISSING ❌

**Required:**

```typescript
test.beforeEach(async ({ page }, testInfo) => {
  // Initialize self-healing
});
```

**Priority:** P2 (NICE TO HAVE)

---

## 📊 UPDATED STATISTICS

### Completed: ~65-70%

**Major Progress:**

- ✅ Locator Engine Integration (NEW!)
- ✅ Screenshot Capture (NEW!)
- ✅ Real Trace Event Recording (NEW!)
- ✅ Healing Validation Logic (NEW!)
- ✅ Core Engine (9 files)
- ✅ UI Components (4 files)
- ✅ TypeScript types
- ✅ Configuration

### Critically Missing: ~30-35%

**P0 Blockers:**

- ❌ Healing doesn't actually fix tests (throws error after validation)
- ❌ Code modification system (can't apply fixes to test files)
- ❌ Zero tests (0 unit/integration/e2e tests)
- ❌ Zero documentation (0 docs)

**P1 High Priority:**

- ❌ Element highlighting
- ❌ Visual strategy
- ❌ Test lifecycle integration (test name/line number)

---

## 🎯 UPDATED ROADMAP TO MERGE

### Sprint 1 (CRITICAL - Week 1):

1. ❗ **Fix healing retry logic** - Make tests actually succeed with healed locators
2. ❗ **Code Modification System** - Enable "Approve" button to update test files
3. ❗ **Backwards Compatibility Tests** - Ensure no breaking changes
4. ❗ **Element Highlighting** - Wire up highlight button

**Goal:** Core feature fully functional

---

### Sprint 2 (HIGH PRIORITY - Week 2):

5. Visual Strategy implementation
6. Test Lifecycle Integration (real test names)
7. Unit Tests (minimum 50 core tests)
8. Integration Tests (minimum 10 tests)

**Goal:** Feature complete and tested

---

### Sprint 3 (DOCUMENTATION - Week 3):

9. RFC Documentation
10. User Guide with examples
11. API Documentation
12. CHANGELOG Entry
13. E2E Tests (minimum 5 tests)

**Goal:** Production-ready documentation

---

### Sprint 4 (POLISH - Week 4):

14. Performance Tests and optimization
15. Enhanced error handling
16. Learning mode implementation
17. Enhanced reporting

**Goal:** Polish and optimization

---

## 🚨 MOST CRITICAL ISSUES

### #1: Healing validates but doesn't fix tests ⚠️

**Reason:** After finding working locator, still throws original error  
**Impact:** Tests still fail even when healing finds solution  
**Priority:** P0 (BLOCKER)  
**Fix:** Return healed element instead of throwing error

---

### #2: Code Modification System missing ❌

**Reason:** Phase 4 completely unimplemented  
**Impact:** Users can't persist fixes to test files  
**Priority:** P0 (BLOCKER)  
**Fix:** Build AST-based code modifier with backup system

---

### #3: Zero Tests ❌

**Reason:** No unit/integration/e2e tests written  
**Impact:** Cannot validate correctness, stability, or backwards compatibility  
**Priority:** P0 (REQUIRED FOR MERGE)  
**Fix:** Write comprehensive test suite (minimum 65 tests)

---

### #4: Zero Documentation ❌

**Reason:** No RFC, User Guide, API docs  
**Impact:** Users won't understand how to use the feature  
**Priority:** P1 (REQUIRED FOR MERGE)  
**Fix:** Write complete documentation package

---

### #5: Element Highlighting broken ❌

**Reason:** Event dispatched but not handled  
**Impact:** Poor debugging UX in debug mode  
**Priority:** P1 (HIGH)  
**Fix:** Add event handler in recorderApp.ts

---

## ✅ PROGRESS SUMMARY

### Significant Improvements in Latest PR:

1. ✅ **Locator Engine Integration** - Self-healing now intercepts queries!
2. ✅ **Screenshot Capture** - Context preserved for debugging
3. ✅ **Real Trace Events** - No more mock data
4. ✅ **Validation Logic** - Confirms healed locators work
5. ⚠️ **Retry Mechanism** - Validates but doesn't fully retry yet

### Completion Level:

- **Architecture:** 85% ✅ (excellent structure)
- **Core Logic:** 70% ⚠️ (works but doesn't fix tests yet)
- **UI/UX:** 90% ✅ (complete and polished)
- **Testing:** 0% ❌ (critical gap)
- **Documentation:** 0% ❌ (critical gap)
- **Code Modification:** 0% ❌ (critical gap)

**Overall:** ~65-70% complete

---

## 🎯 RECOMMENDATION

**The PR has made EXCELLENT progress** with the locator engine integration and real trace recording. However, it still has **3 critical blockers**:

1. **Healing doesn't fix tests** - Validates but throws error instead of succeeding
2. **No code modification** - Can't apply fixes to test files
3. **No tests or documentation** - Can't validate or explain the feature

**Estimated work remaining:** 3-4 weeks for production-ready merge

**Suggested next steps:**

1. Fix retry logic (1-2 days)
2. Build code modifier (3-5 days)
3. Write tests (1 week)
4. Write documentation (3-4 days)
5. Polish and review (2-3 days)

---

**Conclusion:** PR shows strong engineering and excellent architecture. With focused effort on the 3 critical blockers, this could be merge-ready within a month.
