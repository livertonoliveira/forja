/**
 * Integration tests for GET/POST /api/cost/alerts and DELETE /api/cost/alerts/[id] (MOB-1108)
 *
 * Tests route handlers with real fs I/O against forja/alerts.json.
 * Each test gets a clean slate: beforeEach writes an empty alerts file,
 * afterEach restores the original content.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/app/api/cost/alerts/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Mock next/server so the route runs outside the Next.js runtime
// ---------------------------------------------------------------------------

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  },
}));

// ---------------------------------------------------------------------------
// Helpers — resolve the same ALERTS_PATH the route uses
// The route does: path.resolve(process.cwd(), '..', '..', 'forja', 'alerts.json')
// When vitest runs from apps/ui/, cwd() = <root>/apps/ui, so:
//   ../../forja/alerts.json  →  <root>/forja/alerts.json
// ---------------------------------------------------------------------------

const ALERTS_PATH = path.resolve(process.cwd(), '..', '..', 'forja', 'alerts.json');

async function writeAlertsFile(data: { alerts: unknown[] }): Promise<void> {
  await fs.mkdir(path.dirname(ALERTS_PATH), { recursive: true });
  await fs.writeFile(ALERTS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Capture the original content once before any test runs
let originalContent: string | null = null;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Save original file content (may not exist)
  try {
    originalContent = await fs.readFile(ALERTS_PATH, 'utf8');
  } catch {
    originalContent = null;
  }
  // Start each test with an empty alerts store
  await writeAlertsFile({ alerts: [] });
  // Reset module cache so route re-imports cleanly
  vi.resetModules();
});

afterEach(async () => {
  // Restore original content or delete file if it didn't exist before
  if (originalContent !== null) {
    await fs.writeFile(ALERTS_PATH, originalContent, 'utf8');
  } else {
    try {
      await fs.unlink(ALERTS_PATH);
    } catch {
      // ignore if already gone
    }
  }
});

// ---------------------------------------------------------------------------
// Helper to call GET
// ---------------------------------------------------------------------------

async function callGET() {
  const { GET } = await import('../route');
  const req = new Request('http://localhost/api/cost/alerts');
  const res = await GET(req);
  const json = await res.json();
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Helper to call POST
// ---------------------------------------------------------------------------

async function callPOST(body: unknown) {
  const { POST } = await import('../route');
  const req = new Request('http://localhost/api/cost/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Helper to call DELETE /api/cost/alerts/[id]
// ---------------------------------------------------------------------------

async function callDELETE(id: string) {
  // Use a path alias to avoid the bracket being misinterpreted as a glob pattern
  const { DELETE } = await import(
    /* @vite-ignore */
    '@/app/api/cost/alerts/[id]/route'
  );
  const req = new Request(`http://localhost/api/cost/alerts/${id}`, {
    method: 'DELETE',
  });
  const res = await DELETE(req, { params: { id } });
  const json = await res.json();
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Valid payload factory
// ---------------------------------------------------------------------------

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    project: 'MOB',
    threshold_usd: 50,
    period: 'month',
    notifyVia: ['email'],
    ...overrides,
  };
}

// ===========================================================================
// GET /api/cost/alerts
// ===========================================================================

describe('GET /api/cost/alerts', () => {
  it('1. returns 200 with empty array when alerts.json has no entries', async () => {
    const { status, json } = await callGET();

    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(0);
  });

  it('2. returns 200 with array of alerts when file has entries', async () => {
    const existing = {
      alerts: [
        {
          id: 'abc-123',
          project: 'MOB',
          threshold_usd: 100,
          period: 'month',
          notifyVia: ['email'],
          budgetCap: false,
        },
      ],
    };
    await writeAlertsFile(existing);

    const { status, json } = await callGET();

    expect(status).toBe(200);
    expect(json).toHaveLength(1);
  });

  it('3. returns correct shape (id, project, threshold_usd, period, notifyVia, budgetCap)', async () => {
    const alert = {
      id: 'abc-123',
      project: 'MOB',
      threshold_usd: 100,
      period: 'month',
      notifyVia: ['email'],
      budgetCap: false,
    };
    await writeAlertsFile({ alerts: [alert] });

    const { json } = await callGET();

    const row = json[0];
    expect(row).toHaveProperty('id', 'abc-123');
    expect(row).toHaveProperty('project', 'MOB');
    expect(row).toHaveProperty('threshold_usd', 100);
    expect(row).toHaveProperty('period', 'month');
    expect(row).toHaveProperty('notifyVia');
    expect(row).toHaveProperty('budgetCap', false);
  });
});

// ===========================================================================
// POST /api/cost/alerts
// ===========================================================================

describe('POST /api/cost/alerts', () => {
  it('4. returns 201 with created alert including auto-generated id for valid payload', async () => {
    const { status, json } = await callPOST(validPayload());

    expect(status).toBe(201);
    expect(json).toHaveProperty('id');
    expect(typeof json.id).toBe('string');
    expect(json.id.length).toBeGreaterThan(0);
    expect(json.project).toBe('MOB');
    expect(json.threshold_usd).toBe(50);
    expect(json.period).toBe('month');
  });

  it('5. returns 400 with validation error when project is empty', async () => {
    const { status, json } = await callPOST(validPayload({ project: '' }));

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
  });

  it('6. returns 400 when threshold_usd is 0', async () => {
    const { status, json } = await callPOST(validPayload({ threshold_usd: 0 }));

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
  });

  it('6b. returns 400 when threshold_usd is negative', async () => {
    const { status, json } = await callPOST(validPayload({ threshold_usd: -10 }));

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
  });

  it('7. returns 400 when period is invalid (e.g. "quarter")', async () => {
    const { status, json } = await callPOST(validPayload({ period: 'quarter' }));

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
  });

  it('8. returns 400 when notifyVia contains invalid channel (e.g. "whatsapp")', async () => {
    const { status, json } = await callPOST(validPayload({ notifyVia: ['whatsapp'] }));

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
  });

  it('9. returns 201 and persists the alert — subsequent GET returns it', async () => {
    const { status: postStatus, json: created } = await callPOST(validPayload());
    expect(postStatus).toBe(201);

    const { status: getStatus, json: list } = await callGET();
    expect(getStatus).toBe(200);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
  });

  it('10. accepts budgetCap: true', async () => {
    const { status, json } = await callPOST(validPayload({ budgetCap: true }));

    expect(status).toBe(201);
    expect(json.budgetCap).toBe(true);
  });
});

// ===========================================================================
// DELETE /api/cost/alerts/[id]
// ===========================================================================

describe('DELETE /api/cost/alerts/[id]', () => {
  it('11. returns 200 { ok: true } when alert exists and is deleted', async () => {
    // Create an alert first
    const { json: created } = await callPOST(validPayload());
    const id = created.id as string;

    const { status, json } = await callDELETE(id);

    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it('12. returns 404 when alert id does not exist', async () => {
    const { status, json } = await callDELETE('00000000-0000-0000-0000-000000000000');

    expect(status).toBe(404);
    expect(json).toHaveProperty('error');
  });

  it('13. after DELETE, GET no longer returns the deleted alert', async () => {
    // Create two alerts
    const { json: alert1 } = await callPOST(validPayload({ project: 'MOB' }));
    const { json: alert2 } = await callPOST(validPayload({ project: 'WEB' }));

    // Delete the first one
    await callDELETE(alert1.id as string);

    // GET should return only the second
    const { json: list } = await callGET();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(alert2.id);
  });
});
