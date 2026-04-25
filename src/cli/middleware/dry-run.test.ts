/**
 * Unit tests for DryRunInterceptor — MOB-1078.
 *
 * Covers:
 *   - Default state: disabled
 *   - enable() / isEnabled() / reset() lifecycle
 *   - intercept(): calls fn when disabled
 *   - intercept(): suppresses fn and prints [DRY-RUN] when enabled
 *   - Zero external calls during dry-run (mock pattern)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DryRunInterceptor, DRY_RUN_ACTIONS } from './dry-run.js';

// ---------------------------------------------------------------------------
// State lifecycle
// ---------------------------------------------------------------------------

describe('DryRunInterceptor — state lifecycle', () => {
  beforeEach(() => { DryRunInterceptor.reset(); });
  afterEach(() => { DryRunInterceptor.reset(); });

  it('is disabled by default', () => {
    expect(DryRunInterceptor.isEnabled()).toBe(false);
  });

  it('enable() activates dry-run mode', () => {
    DryRunInterceptor.enable();
    expect(DryRunInterceptor.isEnabled()).toBe(true);
  });

  it('reset() restores disabled state after enable()', () => {
    DryRunInterceptor.enable();
    DryRunInterceptor.reset();
    expect(DryRunInterceptor.isEnabled()).toBe(false);
  });

  it('calling enable() multiple times is idempotent', () => {
    DryRunInterceptor.enable();
    DryRunInterceptor.enable();
    expect(DryRunInterceptor.isEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// intercept() — dry-run disabled (normal mode)
// ---------------------------------------------------------------------------

describe('DryRunInterceptor.intercept — dry-run disabled', () => {
  beforeEach(() => { DryRunInterceptor.reset(); });
  afterEach(() => { DryRunInterceptor.reset(); });

  it('calls the action function when dry-run is disabled', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await DryRunInterceptor.intercept('test:action', fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resolves with undefined (fn return value) when disabled', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await expect(DryRunInterceptor.intercept('test:action', fn)).resolves.toBeUndefined();
  });

  it('does NOT write to stdout when disabled', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await DryRunInterceptor.intercept('test:action', vi.fn().mockResolvedValue(undefined));
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// intercept() — dry-run enabled (suppression mode)
// ---------------------------------------------------------------------------

describe('DryRunInterceptor.intercept — dry-run enabled', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    DryRunInterceptor.reset();
    DryRunInterceptor.enable();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    DryRunInterceptor.reset();
  });

  it('does NOT call the action function when dry-run is enabled', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await DryRunInterceptor.intercept('test:action', fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('resolves with undefined when suppressed', async () => {
    await expect(
      DryRunInterceptor.intercept('test:action', vi.fn())
    ).resolves.toBeUndefined();
  });

  it('prints [DRY-RUN] would execute: <actionName> to stdout', async () => {
    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.GITHUB_CREATE_CHECK, vi.fn());
    expect(stdoutSpy).toHaveBeenCalledWith('[DRY-RUN] would execute: github:createCheck\n');
  });

  it('prints the correct action name for slack:notifySlack', async () => {
    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.SLACK_NOTIFY, vi.fn());
    expect(stdoutSpy).toHaveBeenCalledWith('[DRY-RUN] would execute: slack:notifySlack\n');
  });

  it('prints the correct action name for webhook:httpPost', async () => {
    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.WEBHOOK_HTTP_POST, vi.fn());
    expect(stdoutSpy).toHaveBeenCalledWith('[DRY-RUN] would execute: webhook:httpPost\n');
  });

  it('prints the correct action name for cost:writeCostEvent', async () => {
    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.COST_WRITE_EVENT, vi.fn());
    expect(stdoutSpy).toHaveBeenCalledWith('[DRY-RUN] would execute: cost:writeCostEvent\n');
  });

  it('zero calls to external fetch during dry-run', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.WEBHOOK_HTTP_POST, async () => {
      await fetch('https://example.com/hook');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('zero calls to write functions during dry-run (mock pattern)', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);

    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.COST_WRITE_EVENT, async () => {
      await writeFn();
    });

    expect(writeFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// intercept() — multiple sequential calls
// ---------------------------------------------------------------------------

describe('DryRunInterceptor.intercept — multiple actions', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    DryRunInterceptor.reset();
    DryRunInterceptor.enable();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    DryRunInterceptor.reset();
  });

  it('suppresses all actions and prints each action name', async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();

    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.GITHUB_CREATE_CHECK, fn1);
    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.SLACK_NOTIFY, fn2);
    await DryRunInterceptor.intercept(DRY_RUN_ACTIONS.WEBHOOK_HTTP_POST, fn3);

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
    expect(fn3).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledTimes(3);
  });
});
