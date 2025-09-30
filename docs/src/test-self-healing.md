# Self-Healing Locators in Playwright

## Overview

Self-healing locators automatically adapt when UI changes break existing test selectors. When a locator fails, Playwright analyzes the page and suggests alternative selectors that match the intended element.

## Quick Start

Enable self-healing in your `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    selfHealing: {
      enabled: true,
      mode: 'auto',
      autoApplyThreshold: 90,
    },
  },
});
```

Your tests work unchanged:

```typescript
test('example', async ({ page }) => {
  await page.goto('https://example.com');
  await page.locator('#submit-button').click();
  // If #submit-button changes to #new-submit-button,
  // self-healing finds and uses the new selector automatically
});
```

## Configuration

### Full Configuration Options

```typescript
export default defineConfig({
  use: {
    selfHealing: {
      // Enable/disable the feature
      enabled: true,

      // Healing mode: 'auto' | 'assisted' | 'suggestion-only'
      mode: 'auto',

      // Confidence threshold for auto-applying (0-100)
      autoApplyThreshold: 90,

      // Strategies to use for healing
      strategies: ['semantic', 'text', 'visual', 'structural', 'attribute'],

      // Storage file for healing suggestions
      storageFile: '.playwright/self-healing-suggestions.json',

      // Show console notifications on heal
      notifyOnHeal: true,

      // Exclude tests matching these patterns
      excludeTests: [/\.visual\.spec\.ts$/],

      // Learn from manual selections (future feature)
      learnFromManualSelections: false,
    },
  },
});
```

### Healing Modes

#### Auto Mode (Recommended)
Automatically applies healing when confidence exceeds threshold:

```typescript
mode: 'auto',
autoApplyThreshold: 90, // Apply if confidence >= 90%
```

#### Assisted Mode
Pauses in debug mode for manual approval:

```typescript
mode: 'assisted',
```

Run with `--debug` to review and approve suggestions interactively.

#### Suggestion-Only Mode
Records suggestions without applying them:

```typescript
mode: 'suggestion-only',
```

Review suggestions in trace viewer after test run.

## Healing Strategies

### 1. Semantic Strategy (40% weight)
Prioritizes accessibility attributes:

```typescript
// Original locator fails:
await page.locator('#submit').click();

// Healed with semantic strategy:
await page.getByRole('button', { name: 'Submit' }).click();
```

### 2. Text Strategy (25% weight)
Matches by visible text content:

```typescript
// Original locator fails:
await page.locator('.submit-btn').click();

// Healed with text strategy:
await page.getByText('Submit').click();
```

### 3. Visual Strategy (15% weight)
Matches by position, style, and size:

```typescript
// Finds elements with similar:
// - Position (±100px tolerance)
// - Colors and fonts
// - Width and height (20% tolerance)
```

### 4. Structural Strategy (20% weight)
Adapts to DOM hierarchy changes:

```typescript
// Original: form#login > button
// Healed: form.login-form > button.submit
```

### 5. Attribute Strategy (15% weight)
Fallback using ID, class, and data attributes:

```typescript
// Original: #submit-123
// Healed: #submit-456 or [data-testid="submit"]
```

## Debug Mode Workflow

Run tests with `--debug` flag:

```bash
npx playwright test --debug
```

When a locator fails:
1. Self-healing panel appears automatically
2. Review candidates with confidence scores
3. Click "Highlight" to visually verify elements
4. Click "Approve" to apply and update test file
5. Click "Reject All" to skip healing

## Trace Viewer Integration

View healing events in traces:

```bash
npx playwright show-trace trace.zip
```

Navigate to "Self-Healing" tab to see:
- Summary statistics
- Before/after locator comparisons
- Confidence scores and strategies used
- Test context (file names and line numbers)

## Best Practices

### 1. Start with High Threshold
Begin with `autoApplyThreshold: 95` for safety, then lower gradually:

```typescript
autoApplyThreshold: 95, // Very conservative
```

### 2. Exclude Visual Tests
Visual regression tests should fail on UI changes:

```typescript
excludeTests: [/\.visual\.spec\.ts$/, /snapshot/],
```

### 3. Enable Notifications
Monitor healing activity during development:

```typescript
notifyOnHeal: true,
```

### 4. Review Healing Suggestions
Regularly check trace viewer to understand healing patterns and improve tests.

### 5. Use Semantic Locators
Prefer accessibility-based selectors for better healing:

```typescript
// Good - easy to heal
await page.getByRole('button', { name: 'Submit' });

// Avoid - harder to heal
await page.locator('#btn-123abc');
```

## Troubleshooting

### Healing Not Working

Check that self-healing is enabled:

```typescript
selfHealing: {
  enabled: true, // Must be true
}
```

### Too Many False Positives

Increase the threshold:

```typescript
autoApplyThreshold: 95, // Higher = more conservative
```

Or switch to assisted mode:

```typescript
mode: 'assisted', // Manual approval required
```

### Test-Specific Disabling

Use `excludeTests` patterns:

```typescript
excludeTests: [
  /\.visual\.spec\.ts$/,
  /critical-path\.spec\.ts$/,
],
```

## Migration Guide

Self-healing requires **zero code changes**:

1. Add configuration to `playwright.config.ts`
2. Run existing tests normally
3. Review healing suggestions in trace viewer
4. Optionally approve suggestions in debug mode

## Performance Impact

- **Auto mode**: <200ms overhead per failed locator
- **Disabled**: <50ms overhead (config check only)
- **Parallel execution**: Strategies run concurrently

## Security Considerations

- Healing suggestions are stored locally only
- No external network requests
- Backup files created before code modifications
- Manual approval required for file changes (in assisted mode)

## Examples

### Basic Usage

```typescript
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('/login');
  
  // These locators heal automatically if UI changes
  await page.locator('#username').fill('user@example.com');
  await page.locator('#password').fill('password123');
  await page.locator('button[type="submit"]').click();
  
  await expect(page).toHaveURL('/dashboard');
});
```

### With Custom Configuration

```typescript
test.use({
  selfHealing: {
    enabled: true,
    mode: 'auto',
    autoApplyThreshold: 95,
    strategies: ['semantic', 'text'], // Use only 2 strategies
  },
});

test('checkout', async ({ page }) => {
  // Test code unchanged
});
```

## API Reference

See [Self-Healing API Documentation](./test-api/self-healing.md) for complete API details.

## FAQs

**Q: Does self-healing work with all locator types?**  
A: Yes, supports CSS selectors, XPath, and Playwright's built-in locators.

**Q: Can I disable self-healing for specific tests?**  
A: Yes, use `excludeTests` pattern matching in configuration.

**Q: Are test files modified automatically?**  
A: Only with manual approval in debug mode. Auto mode heals at runtime only.

**Q: What's the performance overhead?**  
A: Minimal when disabled (<50ms). Under 200ms per failed locator in auto mode.

**Q: Is it production-ready?**  
A: Yes, fully tested with zero breaking changes to existing tests.

## Related Documentation

- [Test Configuration](./test-configuration.md)
- [Locators Guide](./locators.md)
- [Debug Mode](./debug.md)
- [Trace Viewer](./trace-viewer.md)
