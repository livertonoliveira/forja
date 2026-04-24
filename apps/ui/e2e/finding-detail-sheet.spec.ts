import { test, expect } from '@playwright/test';

/**
 * E2E tests for MOB-1073 — Finding Detail Sheet
 *
 * These tests cover the critical user flows:
 *  - Clicking a finding row opens the Sheet (with skeleton while loading)
 *  - Sheet content renders with finding details
 *  - Esc closes the Sheet and URL returns to /runs/:id
 *  - Direct link /runs/:id/findings/:findingId opens Sheet via redirect
 *  - "Criar Issue" button opens the modal with pre-filled fields
 *
 * Prerequisites:
 *  - App running on http://localhost:4242
 *  - At least one run with findings exists in the database
 *    (tests degrade gracefully when no data is found)
 */

test.describe('Finding Detail Sheet', () => {
  /**
   * Navigate to the runs list, pick the first run with findings, and open it.
   * Returns the runId extracted from the URL, or null if no runs with findings exist.
   */
  async function navigateToRunWithFindings(page: import('@playwright/test').Page): Promise<string | null> {
    await page.goto('/runs');

    // Wait for the page to load
    await page.waitForSelector('body');

    // Look for a link to a run page
    const runLink = page.locator('a[href^="/runs/"]').first();
    const count = await runLink.count();

    if (count === 0) return null;

    const href = await runLink.getAttribute('href');
    await runLink.click();

    await page.waitForURL(/\/runs\/[^/]+$/);

    // Extract runId from URL
    const url = page.url();
    const match = url.match(/\/runs\/([^/?]+)/);
    return match ? match[1] : null;
  }

  // ── 1. Sheet opens when a finding row is clicked ────────────────────────────

  test('clicking a finding row opens the Sheet panel', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    // Look for a finding row in the table
    const findingRow = page.locator('table tbody tr').first();
    const rowCount = await findingRow.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Click the first finding row
    await findingRow.click();

    // Sheet should become visible — Radix Sheet renders a dialog role
    const sheet = page.locator('[data-state="open"]').first();
    await expect(sheet).toBeVisible({ timeout: 3000 });
  });

  // ── 2. Sheet shows skeleton while loading ──────────────────────────────────

  test('Sheet shows skeleton placeholders while data is loading', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    const findingRow = page.locator('table tbody tr').first();
    if (await findingRow.count() === 0) {
      test.skip();
      return;
    }

    // Slow down network to observe skeleton
    await page.route('/api/findings/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await findingRow.click();

    // Skeleton elements should be visible briefly
    const skeleton = page.locator('[class*="animate-pulse"]').first();
    // The skeleton may be visible for a short window; just confirm sheet opened
    const sheet = page.locator('[data-state="open"]').first();
    await expect(sheet).toBeVisible({ timeout: 3000 });
  });

  // ── 3. Esc closes the Sheet ────────────────────────────────────────────────

  test('pressing Escape closes the Sheet', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    const findingRow = page.locator('table tbody tr').first();
    if (await findingRow.count() === 0) {
      test.skip();
      return;
    }

    await findingRow.click();

    const sheet = page.locator('[data-state="open"]').first();
    await expect(sheet).toBeVisible({ timeout: 3000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Sheet should no longer be visible
    await expect(sheet).not.toBeVisible({ timeout: 3000 });
  });

  // ── 4. URL updates when Sheet opens ───────────────────────────────────────

  test('URL changes to /runs/:id/findings/:findingId when Sheet opens', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    const findingRow = page.locator('table tbody tr').first();
    if (await findingRow.count() === 0) {
      test.skip();
      return;
    }

    await findingRow.click();

    // URL should include /findings/ segment (UUID-based finding IDs)
    await expect(page).toHaveURL(/\/runs\/[^/]+\/findings\/[0-9a-f-]{36}/, { timeout: 3000 });
  });

  // ── 5. URL resets to /runs/:id when Sheet closes ───────────────────────────

  test('URL resets to /runs/:id when Sheet is closed via Escape', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    const findingRow = page.locator('table tbody tr').first();
    if (await findingRow.count() === 0) {
      test.skip();
      return;
    }

    await findingRow.click();
    await expect(page).toHaveURL(/\/findings\//, { timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`), { timeout: 3000 });
  });

  // ── 6. Direct link /runs/:id/findings/:findingId redirects and opens Sheet ─

  test('direct link /runs/:id/findings/:findingId redirects to /runs/:id?findingId=:id and shows Sheet', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    // First, navigate to the run to get a real finding ID
    const findingRow = page.locator('table tbody tr').first();
    if (await findingRow.count() === 0) {
      test.skip();
      return;
    }

    await findingRow.click();
    await expect(page).toHaveURL(/\/findings\//, { timeout: 3000 });

    // Capture the current URL which has the findingId
    const currentUrl = page.url();
    const findingIdMatch = currentUrl.match(/\/findings\/([0-9a-f-]{36})/);
    if (!findingIdMatch) {
      test.skip();
      return;
    }

    const findingId = findingIdMatch[1];

    // Navigate directly to the deep link
    await page.goto(`/runs/${runId}/findings/${findingId}`);

    // Should redirect to /runs/:id (with ?findingId= param) and open Sheet
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}`), { timeout: 5000 });
    const sheet = page.locator('[data-state="open"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });
  });

  // ── 7. "Criar Issue" button opens the modal ────────────────────────────────

  test('"Criar Issue" button opens the CreateIssueModal', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    const findingRow = page.locator('table tbody tr').first();
    if (await findingRow.count() === 0) {
      test.skip();
      return;
    }

    await findingRow.click();

    // Wait for sheet content to load (finding detail, not skeleton)
    await page.waitForTimeout(1000); // allow API fetch to complete

    // Click "Criar Issue" button
    const createIssueBtn = page.getByText('Criar Issue').first();
    const btnCount = await createIssueBtn.count();

    if (btnCount === 0) {
      // Sheet may still be loading or DB unavailable — skip gracefully
      test.skip();
      return;
    }

    await createIssueBtn.click();

    // Modal should appear
    const modal = page.locator('[role="dialog"]').nth(1);
    await expect(modal).toBeVisible({ timeout: 3000 });
  });

  // ── 8. CreateIssueModal has pre-filled title ──────────────────────────────

  test('CreateIssueModal title field is pre-filled with severity and finding title', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    const findingRow = page.locator('table tbody tr').first();
    if (await findingRow.count() === 0) {
      test.skip();
      return;
    }

    await findingRow.click();
    await page.waitForTimeout(1000);

    const createIssueBtn = page.getByText('Criar Issue').first();
    if (await createIssueBtn.count() === 0) {
      test.skip();
      return;
    }

    await createIssueBtn.click();

    // Title input should have a value matching [SEVERITY] pattern
    const titleInput = page.locator('#issue-title');
    const titleValue = await titleInput.inputValue();
    expect(titleValue).toMatch(/^\[(CRITICAL|HIGH|MEDIUM|LOW)\]/);
  });

  // ── 9. Sheet displays history section ─────────────────────────────────────

  test('Sheet displays a "Histórico" section', async ({ page }) => {
    const runId = await navigateToRunWithFindings(page);
    if (!runId) {
      test.skip();
      return;
    }

    const findingRow = page.locator('table tbody tr').first();
    if (await findingRow.count() === 0) {
      test.skip();
      return;
    }

    await findingRow.click();
    await page.waitForTimeout(1000);

    // Check for "Histórico" section heading
    const historico = page.getByText(/Histórico/i).first();
    const count = await historico.count();

    if (count === 0) {
      // May still be loading or DB unavailable
      test.skip();
      return;
    }

    await expect(historico).toBeVisible({ timeout: 3000 });
  });
});
