# 📋 UPDATED Remaining Tasks List for Playwright Self-Healing PR

**Analysis Date:** Based on code from PR #3  
**Completion Percentage:** ~45-50% (increased from 30-35%)

---

## ✅ WHAT'S IMPLEMENTED (Overview)

### Fully Implemented:

1. ✅ Core Healing Engine (healingEngine.ts, scoringAlgorithm.ts)
2. ✅ Suggestion Store (suggestionStore.ts)
3. ✅ Self Healing Wrapper (selfHealingWrapper.ts)
4. ✅ 4 strategies: Semantic, Text, Structural, Attribute
5. ✅ Debug Mode UI Panel (SelfHealingPanel.tsx + CSS)
6. ✅ Trace Viewer Integration (SelfHealingTab.tsx + CSS)
7. ✅ TypeScript types for configuration
8. ✅ Configuration integration (playwright.config.ts)
9. ✅ Recorder integration (recorderApp.ts, recorder.tsx)

---

## 🔴 CRITICAL TASKS (Blocking merge)

### 1. Locator Engine Integration (❌ NOT IMPLEMENTED)

**Problem:** `selfHealingWrapper.ts` is created but **NOT integrated** into Playwright's locator engine

**Current State:**

```typescript
// selfHealingWrapper.ts exists, but wrapSelectorResolution() method
// is NEVER CALLED from locator engine
```

**Required:**

- Modify `packages/playwright-core/src/server/locators/locatorEngine.ts`
- Add call to `selfHealingWrapper.wrapSelectorResolution()` in `_locateElement` method
- Integrate TimeoutError and TargetClosedError interception

**Files to Modify:**

```
packages/playwright-core/src/server/locators/locatorEngine.ts
packages/playwright-core/src/server/frames.ts (for Frame._locateElement integration)
```

---

### 2. Healing Application Logic (❌ CRITICAL ISSUE)

**Problem:** Healing engine finds candidates but **DOESN'T APPLY** them to tests

**Code shows:**

```typescript
// selfHealingWrapper.ts:84-86
// TODO: We would need to modify the action to use the new selector
// For now, log the suggestion but continue with original error
if (this.config?.notifyOnHeal) { console.log(...) }
```

**What's Missing:**

1. Runtime locator substitution mechanism
2. Retry logic with new locator
3. Actual test continuation with healed locator

**Required Implementation:**

```typescript
// Pseudo-code
async wrapSelectorResolution<R>(frame, originalSelector, action, context) {
  try {
    return await action(); // Original attempt
  } catch (error) {
    const healingResult = await this.attemptHealing(...);

    if (healingResult.success && healingResult.appliedLocator) {
      // ❌ THIS IS MISSING: Apply healed locator and RETRY action
      const newAction = createActionWithNewSelector(healingResult.appliedLocator);
      return await newAction(); // RETRY
    }

    throw error;
  }
}
```

---

### 3. Screenshot Capture (❌ NOT IMPLEMENTED)

**Current State:**

```typescript
// healingEngine.ts:187 - only captures URL and title
private async captureSnapshot(page: Page): Promise<any> {
  return {
    url: page.mainFrame().url(),
    title: await page.mainFrame().title(),
    timestamp: Date.now()
    // ❌ MISSING: screenshot capture
  };
}
```

**Required:**

```typescript
private async captureSnapshot(page: Page): Promise<any> {
  const screenshot = await page.screenshot({ type: 'png' });
  return {
    url: page.mainFrame().url(),
    title: await page.mainFrame().title(),
    timestamp: Date.now(),
    screenshot: screenshot.toString('base64') // ✅ ADD THIS
  };
}
```

---

### 4. Element Highlighting (❌ NOT WORKING)

**Problem:** UI "Highlight" button exists but doesn't highlight elements

**Code:**

```typescript
// selfHealingPanel.tsx:52
onHighlight={(locator) => {
  window.dispatch({ event: 'highlightRequested', params: { selector: locator } });
}}
```

**But:** `highlightRequested` event is **NOT HANDLED** in recorderApp.ts for self-healing locators

**Required:**

- Add `highlightRequested` handling in recorderApp.ts
- Integrate with existing Playwright highlight infrastructure
- Actual element highlighting on page

---

### 5. Code Modification System (❌ COMPLETELY MISSING)

**Phase 4 from PRD is completely unimplemented**

**Missing Files:**

```
packages/playwright/src/runner/codegen/
├── codeModifier.ts          ❌ MISSING
└── locatorReplacer.ts       ❌ MISSING
```

**Problem in UI:**

```typescript
// selfHealingTab.tsx:1204-1210
const handleApprove = async () => {
  await applyHealingToCode({
    // ❌ Function DOESN'T EXIST
    testFile: event.testFile,
    line: event.line,
    oldLocator: event.originalLocator,
    newLocator: event.healedLocator,
  });
};
```

**Required Implementation:**

1. `CodeModifier` class with AST parsing
2. `applyHealingToCode()` function
3. Backup system for test files
4. Safe code replacement preserving formatting

---

### 6. Visual Strategy (❌ MISSING)

**From PRD:** Visual Strategy with 20% weight in scoring algorithm

**Current State:**

```typescript
// healingEngine.ts:105-114
switch (name) {
  case "semantic":
    strategies.push(new SemanticStrategy());
    break;
  case "text":
    strategies.push(new TextStrategy());
    break;
  case "structural":
    strategies.push(new StructuralStrategy());
    break;
  case "attribute":
    strategies.push(new AttributeStrategy());
    break;
  // ❌ case 'visual': NO IMPLEMENTATION
}
```

**Need to Create:**

```
packages/playwright-core/src/server/selfHealing/strategies/
└── visualStrategy.ts  ❌ MISSING
```

**Functionality:**

- Position-based similarity (±100px)
- Visual style matching (color, backgroundColor, fontSize, fontWeight)
- Size similarity calculation
- Bounding box comparison

---

### 7. Trace Event Recording (❌ MOCKED DATA)

**Critical Problem:**

```typescript
// selfHealingTab.tsx:45-105
export function useSelfHealingTabModel(model) {
  // For now, we'll create mock data since the healing events aren't integrated yet
  const mockEvents: HealingTraceEvent[] = [
    // ❌ HARDCODED MOCK DATA
  ];

  return { healingEvents: mockEvents };
}
```

**Required:**

1. Real HealingTraceEvent recording in trace files
2. Integration with trace recording infrastructure
3. Extract real events from model.events
4. Persistence in trace.zip

---

## 🟠 HIGH PRIORITY TASKS

### 8. Test Lifecycle Integration (❌ NOT WORKING)

**Problem:** Configuration is read but NOT used

**Code:**

```typescript
// packages/playwright/src/index.ts:237-240
if (selfHealing) {
  const {
    configureSelfHealing,
  } = require("../../../playwright-core/src/server/selfHealing/selfHealingWrapper");
  configureSelfHealing(selfHealing); // ✅ Called
}
```

**But:** `configureSelfHealing()` only initializes wrapper but **DOESN'T HOOK** into test execution

**Required:**

- Hook into `packages/playwright/src/runner/testRun.ts`
- Integration with test lifecycle events
- Context passing with testName and lineNumber

---

### 9. Edit Manually Functionality (❌ STUB)

**Code:**

```typescript
// selfHealingPanel.tsx:113
onClick={() => {
  /* open editor */  // ❌ EMPTY FUNCTION
}}
```

**Required:**

- Open code editor with locator
- Position on correct line
- Integration with existing Playwright inspector editor

---

### 10. Actual Element References (❌ ISSUE)

**All strategies return ElementHandle, but:**

```typescript
// semanticStrategy.ts:110
candidates.push({
  locator: `page.getByRole('${semanticInfo.role}')`,
  element, // ❌ ElementHandle can be detached
  reasoning: `Same role: ${semanticInfo.role}`,
  strategy: this.name,
});
```

**Problem:** ElementHandle references can become invalid by the time of use

**Required:**

- Element reference management
- Lazy evaluation
- Re-querying when needed

---

### 11. Error Handling (⚠️ INSUFFICIENT)

**Problem:** Everywhere `catch { // Ignore errors }`

**Examples:**

```typescript
// semanticStrategy.ts:54, 96, 138, 180
} catch (error) {
  // Ignore errors  ❌ NO LOGGING, NO FALLBACK
}
```

**Required:**

- Proper error logging
- Fallback strategies
- Graceful degradation
- Error reporting to developer

---

## 🟡 MEDIUM PRIORITY

### 12. Learning Mode (❌ MISSING)

**Config option exists:**

```typescript
// types/test.d.ts:7551
learnFromManualSelections?: boolean;
```

**But functionality NOT implemented:**

- No manual selections saving
- No scoring improvement based on history
- No adaptive learning

---

### 13. Enhanced Reporting (⚠️ BASIC FUNCTIONALITY)

**Only implemented:**

```typescript
// suggestionStore.ts:98-128
async getStatistics(): Promise<{
  total: number;
  successful: number;
  applied: number;
  averageScore: number;
}> { }
```

**Missing from PRD:**

- `byStrategy` grouping
- `byTest` grouping
- HTML export
- Detailed analytics

---

### 14. notifyOnHeal Implementation (⚠️ PARTIAL)

**Implemented:** Console logging only

**Missing:**

- File notifications
- Webhook notifications
- Structured logging format

---

### 15. excludeTests Implementation (❌ NOT WORKING)

**Code exists:**

```typescript
// healingEngine.ts:129-136
if (this.config.excludeTests && context.testName) {
  for (const regex of this.config.excludeTests) {
    if (regex.test(context.testName)) {
      return { success: false, reason: "Test excluded" };
    }
  }
}
```

**Problem:** `context.testName` is **NEVER PASSED** from test runner

---

## 🟢 LOW PRIORITY (Quality of Life)

### 16. Performance Optimizations (❌ NOT VALIDATED)

**PRD Requirements:**

- <200ms overhead per locator attempt
- <50ms when disabled
- Performance benchmarks

**Status:** No measurements, no benchmarks

---

### 17. Locator Type Detection (⚠️ SIMPLIFIED)

**Current State:** Simple regex matching

**Needs Improvement:**

- Better CSS selector parsing
- XPath detection improvement
- Playwright-specific locator formats (getByRole, getByText, etc.)

---

### 18. Candidate Deduplication (⚠️ BASIC)

**Current Implementation:**

```typescript
// healingEngine.ts:196-204
private deduplicateCandidates(candidates: CandidateElement[]): CandidateElement[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = `${candidate.locator}:${candidate.strategy}`;
    // ⚠️ Simple deduplication, may miss duplicates
  });
}
```

**Required:**

- Semantic equivalence detection
- Score-based prioritization
- Better duplicate detection

---

## 📚 TESTING (CRITICALLY MISSING)

### 19. Unit Tests (❌ COMPLETELY MISSING)

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
│   ├── attributeStrategy.spec.ts      ❌
│   └── visualStrategy.spec.ts         ❌
└── selfHealingWrapper.spec.ts         ❌
```

---

### 20. Integration Tests (❌ MISSING)

**PRD Requirement:** 25+ integration tests

**Required:**

- Real DOM scenarios
- Multi-strategy coordination
- End-to-end healing workflows
- Cross-browser testing

---

### 21. E2E Tests (❌ MISSING)

**Required:**

- Debug mode workflow tests
- UI Mode workflow tests
- Trace viewer tests
- Recorder integration tests

---

### 22. Performance Tests (❌ MISSING)

**Required:**

- Baseline measurements
- Overhead validation
- Memory leak testing
- Large test suite stress tests

---

### 23. Backwards Compatibility Tests (❌ MISSING)

**Critically Important:**

- Validate zero breaking changes
- Existing test suite must work without changes
- Feature flag testing (enabled/disabled)

---

## 📖 DOCUMENTATION (COMPLETELY MISSING)

### 24. RFC Document (❌ MISSING)

**File:** `packages/playwright/docs/rfcs/self-healing.md`

**Contents:**

- Motivation and use cases
- Technical design
- Migration guide
- Performance impact

---

### 25. API Documentation (❌ MISSING)

**File:** `packages/playwright/docs/src/test-api/self-healing.md`

**Contents:**

- Configuration reference
- Programmatic API
- Examples
- Best practices

---

### 26. User Guide (❌ MISSING)

**File:** `packages/playwright/docs/src/test-self-healing.md`

**Contents:**

- Getting started
- Workflow examples (Auto, Assisted, UI Mode)
- Troubleshooting
- FAQ

---

### 27. Code Comments & TSDoc (⚠️ MINIMAL)

**Current State:** License headers exist, but little JSDoc

**Required:**

- TSDoc for all public APIs
- Implementation notes
- Usage examples in comments

---

### 28. CHANGELOG Entry (❌ MISSING)

**Required:**

- Feature description
- Breaking changes (none)
- Migration steps
- Known limitations

---

## 🔧 PROGRAMMATIC API (❌ MISSING)

### 29. Public API Exports (❌ NO)

**Required in `@playwright/test/healing`:**

```typescript
// ❌ DOESN'T EXIST
export function getSelfHealingSuggestions(
  page: Page,
  locator: string
): Promise<Suggestion[]>;
export function applySuggestion(options: ApplySuggestionOptions): Promise<void>;
export function exportReport(format: "json" | "html"): Promise<string>;
```

---

### 30. Test Hooks API (❌ NOT IMPLEMENTED)

**Required:**

```typescript
test.beforeEach(async ({ page }, testInfo) => {
  // Initialize self-healing for this test
});

test.afterEach(async ({ page }, testInfo) => {
  // Save suggestions for this test
});
```

---

## 📊 FINAL STATISTICS

### Completed: ~45-50%

- ✅ Core Engine structure (9 files)
- ✅ UI Components (4 files)
- ✅ TypeScript types
- ✅ Basic configuration

### Critically Missing: ~50-55%

- ❌ Locator engine integration (BLOCKER)
- ❌ Healing application logic (BLOCKER)
- ❌ Code modification system (BLOCKER)
- ❌ Visual strategy
- ❌ All tests (0 tests)
- ❌ All documentation (0 docs)
- ❌ Programmatic API
- ❌ Real trace events (mock data)

---

## 🎯 ROADMAP TO MERGE

### Sprint 1 (CRITICAL BLOCKERS):

1. ❗ Locator Engine Integration
2. ❗ Healing Application Logic (retry mechanism)
3. ❗ Real Trace Event Recording
4. ❗ Screenshot Capture
5. ❗ Element Highlighting

### Sprint 2 (CORE COMPLETION):

6. Visual Strategy implementation
7. Code Modification System
8. Test Lifecycle Integration
9. Error Handling improvements

### Sprint 3 (QUALITY):

10. Unit Tests (minimum 50)
11. Integration Tests (minimum 10)
12. E2E Tests (minimum 5)
13. Performance Tests

### Sprint 4 (POLISH):

14. Backwards Compatibility Tests
15. RFC Documentation
16. User Guide
17. API Documentation
18. CHANGELOG Entry

---

## 🚨 MOST CRITICAL ISSUES

### #1: Self-healing DOESN'T WORK in runtime

**Reason:** Wrapper created but NOT integrated into locator engine  
**Impact:** Feature completely non-functional  
**Priority:** P0 (BLOCKER)

### #2: Mock data in Trace Viewer

**Reason:** Healing events not recorded in traces  
**Impact:** UI shows fake data  
**Priority:** P0 (BLOCKER)

### #3: Code Modification System missing

**Reason:** Phase 4 completely skipped  
**Impact:** Approve doesn't work, locators not applied to files  
**Priority:** P0 (BLOCKER)

### #4: Zero Tests

**Reason:** No unit/integration/e2e tests  
**Impact:** Cannot validate correctness  
**Priority:** P1 (REQUIRED FOR MERGE)

### #5: Zero Documentation

**Reason:** No RFC, User Guide, API docs  
**Impact:** Users won't be able to use the feature  
**Priority:** P1 (REQUIRED FOR MERGE)

---

**Conclusion:** PR has good UI/structure (45-50%), but is critically insufficient for merge due to missing core functionality, tests, and documentation.
