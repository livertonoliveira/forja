import { test, expect } from '@playwright/test';

test.describe('Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens with ⌘K shortcut', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();
  });

  test('opens with Ctrl+K shortcut', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible();
  });

  test('closes with Escape', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const dialog = page.getByRole('dialog', { name: /command palette/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('shows navigation group by default', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.getByText('Navegação')).toBeVisible();
    await expect(page.getByText('Runs')).toBeVisible();
    await expect(page.getByText('Heatmap')).toBeVisible();
  });

  test('filters results on search', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const input = page.getByPlaceholder(/buscar/i);
    await input.fill('run');
    // Debounce is 150ms
    await page.waitForTimeout(200);
    // Navigation items matching "run" should be visible
    await expect(page.getByText('Runs')).toBeVisible();
  });

  test('keyboard navigation with arrow keys', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    // Press down to select first item
    await page.keyboard.press('ArrowDown');
    // Press down again
    await page.keyboard.press('ArrowDown');
    // First item should be highlighted (selected)
    // cmdk adds aria-selected to the active item
    const selectedItem = page.locator('[aria-selected="true"]');
    await expect(selectedItem).toBeVisible();
  });

  test('Enter navigates to selected item', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    // Type "runs" to filter navigation
    const input = page.getByPlaceholder(/buscar/i);
    await input.fill('runs');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    // Should navigate to /runs
    await expect(page).toHaveURL(/\/runs/);
  });

  test('G+R shortcut navigates to runs', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('r');
    await expect(page).toHaveURL(/\/runs/);
  });

  test('G+C shortcut navigates to cost', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('c');
    await expect(page).toHaveURL(/\/cost/);
  });

  test('G+H shortcut navigates to heatmap', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('h');
    await expect(page).toHaveURL(/\/heatmap/);
  });

  test('closes on overlay click', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const dialog = page.getByRole('dialog', { name: /command palette/i });
    await expect(dialog).toBeVisible();
    // Click the overlay (outside the panel)
    await page.mouse.click(10, 10);
    await expect(dialog).not.toBeVisible();
  });
});
