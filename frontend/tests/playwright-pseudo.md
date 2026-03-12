# Playwright Pseudo-Tests

The following pseudo-code blocks represent critical integration flows to be implemented in a Playwright/Jest test suite to validate the Phase 5 "Max-Ping" requirements.

## 1. Global Modal & Focus Trapping
```typescript
test('Modal traps focus, handles ESC, and manages body state', async ({ page }) => {
    await page.goto('/');

    // Trigger mass deletion to open modal
    await page.click('#btn-clear-measurements');
    
    // Assert Modal opens
    await expect(page.locator('#global-modal-overlay')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/modal-open/);

    // Assert Focus Trap (First tab goes to Confirm, shift-tab goes to Close)
    await page.keyboard.press('Tab');
    await expect(page.locator('#modal-btn-cancel')).toBeFocused();

    // Assert ESC cancels
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-modal-overlay')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/modal-open/);
});
```

## 2. Accessible Slider ARIA Announcements
```typescript
test('Comparison slider keyboard increments and debounces ARIA', async ({ page }) => {
    await page.goto('/');
    
    // Focus slider
    const slider = page.locator('#viewer-handle');
    await slider.focus();

    // Arrow keys (5%)
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '55');

    // Page Up (10%)
    await page.keyboard.press('PageUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '65');

    // Home
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');

    // Wait for Debounce
    await page.waitForTimeout(350);
    const ariaLive = page.locator('#aria-status');
    await expect(ariaLive).toHaveText(/Comparison slider: 0 percent/);
});
```

## 3. Measurement Tools: Add, Undo, JSON Export
```typescript
test('Measurement pipeline handles discrete ops and data serialization', async ({ page }) => {
    await page.goto('/');
    
    // Select Angle Tool
    await page.click('button[data-tool="angle"]');
    
    // Draw 3-point Angle
    const viewer = page.locator('#comp-viewer');
    await viewer.click({ position: { x: 100, y: 100 } });
    await viewer.click({ position: { x: 150, y: 150 } });
    await viewer.click({ position: { x: 200, y: 100 } });

    // Assert chip dynamically added
    const chip = page.locator('.measurement-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('ANGLE');

    // Assert Undo removes it
    await page.click('#btn-undo-measurement');
    await expect(chip).toBeHidden();

    // Draw Distance
    await page.click('button[data-tool="length"]');
    await viewer.click({ position: { x: 50, y: 50 } });
    await viewer.click({ position: { x: 150, y: 50 } });

    // Assert Export Data triggers download
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#btn-export-measurements')
    ]);
    expect(download.suggestedFilename()).toMatch(/measurements_.*\.json/);
});
```

## 4. Keyboard Fast-Keys & UI Optimistics
```typescript
test('Keyboard palette switches tools without disrupting layout', async ({ page }) => {
    await page.goto('/');

    // Press 'W' for Window Level
    await page.keyboard.press('w');
    await expect(page.locator('button[data-tool="wl"]')).toHaveAttribute('aria-pressed', 'true');

    // Press 'D' for Distance
    await page.keyboard.press('d');
    await expect(page.locator('button[data-tool="length"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button[data-tool="wl"]')).toHaveAttribute('aria-pressed', 'false');
});
```
