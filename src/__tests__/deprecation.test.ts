import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

vi.mock('../trace/writer.js', () => ({
  TraceWriter: vi.fn(),
}));

import { warnDeprecated, resetDeprecationState } from '../deprecation.js';
import { TraceWriter } from '../trace/writer.js';

const MockTraceWriter = vi.mocked(TraceWriter);

beforeEach(() => {
  resetDeprecationState();
  MockTraceWriter.mockClear();
  delete process.env.FORJA_RUN_ID;
  delete process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS;
});

afterEach(() => {
  delete process.env.FORJA_RUN_ID;
  delete process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS;
});

describe('warnDeprecated — deduplication', () => {
  it('emits a warning only once for the same name', () => {
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    warnDeprecated({ name: 'OldApi', since: '1.0.0', removeIn: '3.0.0' });
    warnDeprecated({ name: 'OldApi', since: '1.0.0', removeIn: '3.0.0' });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('emits separate warnings for different names', () => {
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    warnDeprecated({ name: 'OldApi', since: '1.0.0', removeIn: '3.0.0' });
    warnDeprecated({ name: 'OtherApi', since: '1.1.0', removeIn: '3.0.0' });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('warnDeprecated — env var suppression', () => {
  it('emits no warning when FORJA_SUPPRESS_DEPRECATION_WARNINGS=1', () => {
    process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS = '1';
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    warnDeprecated({ name: 'SuppressedApi', since: '1.0.0', removeIn: '3.0.0' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('warnDeprecated — trace writing', () => {
  it('writes a deprecation_warning event when FORJA_RUN_ID is a valid UUID', async () => {
    const runId = randomUUID();
    process.env.FORJA_RUN_ID = runId;

    const writeMock = vi.fn().mockResolvedValue(undefined);
    MockTraceWriter.mockImplementation(() => ({ write: writeMock }) as unknown as TraceWriter);

    vi.spyOn(process, 'emitWarning').mockImplementation(() => {});

    warnDeprecated({ name: 'TracedApi', since: '2.0.0', removeIn: '4.0.0', replacement: 'NewApi' });

    await new Promise(resolve => setImmediate(resolve));

    expect(MockTraceWriter).toHaveBeenCalledWith(runId);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'deprecation_warning',
        runId,
        payload: expect.objectContaining({
          name: 'TracedApi',
          since: '2.0.0',
          removeIn: '4.0.0',
          replacement: 'NewApi',
          severity: 'low',
        }),
      }),
    );

    vi.restoreAllMocks();
  });

  it('does not instantiate TraceWriter when FORJA_RUN_ID is absent', () => {
    delete process.env.FORJA_RUN_ID;
    vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    warnDeprecated({ name: 'NoRunApi', since: '1.0.0', removeIn: '3.0.0' });
    expect(MockTraceWriter).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('does not instantiate TraceWriter when FORJA_RUN_ID is not a valid UUID', () => {
    process.env.FORJA_RUN_ID = 'not-a-uuid';
    vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    warnDeprecated({ name: 'BadRunIdApi', since: '1.0.0', removeIn: '3.0.0' });
    expect(MockTraceWriter).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
