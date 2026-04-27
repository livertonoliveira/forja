/**
 * Unit tests for src/integrations/base.ts and src/integrations/mock.ts — MOB-1083.
 *
 * Tests:
 *  - IntegrationProvider structural typing (compile-time via assignability checks)
 *  - MockIntegrationProvider implements IntegrationProvider
 *  - MockIntegrationProvider.getCalls() records all method invocations correctly
 *  - Each method returns expected fake data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { IntegrationProvider, IssueInput, PRInput } from '../base.js';
import { MockIntegrationProvider } from '../mock.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMock(): MockIntegrationProvider {
  return new MockIntegrationProvider();
}

const ISSUE_INPUT: IssueInput = {
  title: 'Test issue',
  description: 'Description of the test issue',
  severity: 'high',
  labels: ['bug', 'test'],
};

const PR_INPUT: PRInput = {
  title: 'Test PR',
  body: 'Body of the test PR',
  branch: 'feature/test',
  base: 'main',
};

// ---------------------------------------------------------------------------
// IntegrationProvider structural typing
// ---------------------------------------------------------------------------

describe('IntegrationProvider — structural typing', () => {
  it('MockIntegrationProvider is assignable to IntegrationProvider', () => {
    // TypeScript structural typing: if this compiles, the interface is satisfied.
    const mock: IntegrationProvider = makeMock();
    expect(mock).toBeDefined();
  });

  it('IntegrationProvider has the expected shape', () => {
    const mock: IntegrationProvider = makeMock();
    expect(typeof mock.name).toBe('string');
    expect(typeof mock.createIssue).toBe('function');
    expect(typeof mock.updateIssue).toBe('function');
    expect(typeof mock.closeIssue).toBe('function');
    expect(typeof mock.createPR).toBe('function');
    expect(typeof mock.addComment).toBe('function');
    expect(typeof mock.healthCheck).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// MockIntegrationProvider — interface implementation
// ---------------------------------------------------------------------------

describe('MockIntegrationProvider — name', () => {
  it('has readonly name "mock"', () => {
    const mock = makeMock();
    expect(mock.name).toBe('mock');
  });
});

// ---------------------------------------------------------------------------
// MockIntegrationProvider — getCalls()
// ---------------------------------------------------------------------------

describe('MockIntegrationProvider — getCalls()', () => {
  let mock: MockIntegrationProvider;

  beforeEach(() => {
    mock = makeMock();
  });

  it('starts with an empty calls list', () => {
    expect(mock.getCalls()).toHaveLength(0);
  });

  it('records createIssue call with correct args', async () => {
    await mock.createIssue(ISSUE_INPUT);
    const calls = mock.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('createIssue');
    expect(calls[0].args[0]).toEqual(ISSUE_INPUT);
  });

  it('records updateIssue call with correct args', async () => {
    await mock.updateIssue('issue-42', { title: 'Updated title' });
    const calls = mock.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('updateIssue');
    expect(calls[0].args[0]).toBe('issue-42');
    expect(calls[0].args[1]).toEqual({ title: 'Updated title' });
  });

  it('records closeIssue call with correct args', async () => {
    await mock.closeIssue('issue-99');
    const calls = mock.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('closeIssue');
    expect(calls[0].args[0]).toBe('issue-99');
  });

  it('records createPR call with correct args', async () => {
    await mock.createPR(PR_INPUT);
    const calls = mock.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('createPR');
    expect(calls[0].args[0]).toEqual(PR_INPUT);
  });

  it('records addComment call with correct args', async () => {
    await mock.addComment('issue-1', 'This is a comment');
    const calls = mock.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('addComment');
    expect(calls[0].args[0]).toBe('issue-1');
    expect(calls[0].args[1]).toBe('This is a comment');
  });

  it('records healthCheck call with empty args', async () => {
    await mock.healthCheck();
    const calls = mock.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('healthCheck');
    expect(calls[0].args).toHaveLength(0);
  });

  it('accumulates multiple calls in order', async () => {
    await mock.createIssue(ISSUE_INPUT);
    await mock.addComment('issue-1', 'comment');
    await mock.closeIssue('issue-1');
    const calls = mock.getCalls();
    expect(calls).toHaveLength(3);
    expect(calls[0].method).toBe('createIssue');
    expect(calls[1].method).toBe('addComment');
    expect(calls[2].method).toBe('closeIssue');
  });
});

// ---------------------------------------------------------------------------
// MockIntegrationProvider — return values
// ---------------------------------------------------------------------------

describe('MockIntegrationProvider — return values', () => {
  let mock: MockIntegrationProvider;

  beforeEach(() => {
    mock = makeMock();
  });

  it('createIssue returns fake IssueOutput with provider "mock"', async () => {
    const result = await mock.createIssue(ISSUE_INPUT);
    expect(result.id).toBe('mock-issue-1');
    expect(result.url).toContain('mock.example');
    expect(result.provider).toBe('mock');
  });

  it('updateIssue resolves to undefined (void)', async () => {
    const result = await mock.updateIssue('id', { title: 'X' });
    expect(result).toBeUndefined();
  });

  it('closeIssue resolves to undefined (void)', async () => {
    const result = await mock.closeIssue('id');
    expect(result).toBeUndefined();
  });

  it('createPR returns fake PROutput with provider "mock"', async () => {
    const result = await mock.createPR(PR_INPUT);
    expect(result.id).toBe('mock-pr-1');
    expect(result.url).toContain('mock.example');
    expect(result.provider).toBe('mock');
  });

  it('addComment resolves to undefined (void)', async () => {
    const result = await mock.addComment('id', 'body');
    expect(result).toBeUndefined();
  });

  it('healthCheck returns ok: true and latencyMs: 0', async () => {
    const result = await mock.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBe(0);
  });
});
