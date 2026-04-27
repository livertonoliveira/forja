import { test, expect } from '@playwright/test';

/**
 * E2E smoke tests for the DLQ (Dead Letter Queue) page — MOB-1092
 *
 * The /dlq route is guarded by middleware that checks the `forja-role` cookie.
 * Only requests with `forja-role=admin` are allowed through; all others receive
 * a 403 JSON response.
 *
 * Tests:
 *  1. Non-admin access → 403 Forbidden
 *  2. Admin access → page renders with the expected table structure
 *
 * Prerequisites:
 *  - App running on http://localhost:4242 (configured in playwright.config.ts)
 *  - No live database required: the table structure test uses mocked API responses
 */

test.describe('DLQ page', () => {
  // ── 1. Non-admin access returns 403 ───────────────────────────────────────

  test('DLQ page shows 403 for non-admin access', async ({ page }) => {
    // Navigate without the admin cookie — middleware should reject the request
    const response = await page.goto('/dlq');

    // The middleware returns a JSON 403 response directly
    expect(response?.status()).toBe(403);

    // The body should contain the Forbidden error message
    const body = await page.content();
    expect(body).toContain('Forbidden');
  });

  // ── 2. Admin access renders table with expected column headers ─────────────

  test('DLQ page shows table structure for admin user', async ({ page, context }) => {
    // Intercept the /api/dlq call so the test does not need a live database
    await page.route('/api/dlq*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            {
              id: 'test-event-1',
              hookType: 'github.push',
              status: 'dead',
              attempts: 3,
              lastError: 'Connection timeout',
              createdAt: new Date().toISOString(),
              payload: { ref: 'refs/heads/main' },
            },
          ],
          total: 1,
        }),
      });
    });

    // Set the admin cookie before navigating so the middleware allows the request
    await context.addCookies([
      {
        name: 'forja-role',
        value: 'admin',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/dlq');

    // Page heading
    await expect(
      page.getByRole('heading', { name: /Dead Letter Queue/i })
    ).toBeVisible({ timeout: 5000 });

    // Table should be present with all six column headers (translated to pt-BR)
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole('columnheader', { name: 'Tipo' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tentativas' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Último Erro' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Data' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Ações' })).toBeVisible();

    // The mocked event row should appear in the table body
    await expect(page.locator('table tbody tr')).toHaveCount(1);
  });
});
