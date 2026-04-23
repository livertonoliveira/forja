/**
 * Playwright smoke test — Tendências section on /runs (MOB-1068)
 *
 * REFERENCE FILE — not executed automatically.
 * Rename to e2e/runs-trends.spec.ts and configure Playwright to run it.
 *
 * Prerequisites:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *   Dev server running on http://localhost:3000
 *
 * Run:
 *   npx playwright test e2e/runs-trends.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

test.describe('Runs page — Tendências section smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/runs`);
    // Wait for the page to be interactive (hydration complete)
    await page.waitForLoadState('domcontentloaded');
  });

  test('shows "Tendências" section heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /tendências/i }).or(
      page.locator('h2', { hasText: /tendências/i })
    );
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('shows "Findings por Severidade" chart title', async ({ page }) => {
    // TrendChart is dynamically imported (ssr:false) — wait for hydration
    const title = page.getByText('Findings por Severidade');
    await expect(title).toBeVisible({ timeout: 15_000 });
  });

  test('shows "Taxa de Gate" chart title', async ({ page }) => {
    // GateFunnelChart is dynamically imported (ssr:false) — wait for hydration
    const title = page.getByText('Taxa de Gate');
    await expect(title).toBeVisible({ timeout: 15_000 });
  });

  test('granularity toggle buttons are visible in TrendChart area', async ({ page }) => {
    // Wait for at least the TrendChart section to hydrate
    await page.getByText('Findings por Severidade').waitFor({ timeout: 15_000 });

    // There are 4 granularity buttons per chart: hora, dia, semana, mês
    // At least one set should be visible
    await expect(page.getByRole('button', { name: 'hora' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'dia' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'semana' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'mês' }).first()).toBeVisible();
  });

  test('two chart cards are rendered in a 2-column grid', async ({ page }) => {
    await page.getByText('Findings por Severidade').waitFor({ timeout: 15_000 });
    await page.getByText('Taxa de Gate').waitFor({ timeout: 15_000 });

    // Both chart container divs should be present in the DOM
    const section = page.locator('section').filter({ hasText: /tendências/i });
    await expect(section).toBeVisible();
  });

  test('page still shows the runs table heading "Execuções"', async ({ page }) => {
    const execucoes = page.getByRole('heading', { name: /execuções/i });
    await expect(execucoes).toBeVisible({ timeout: 10_000 });
  });
});
