import type { PipelineState } from './fsm.js';

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function setPhaseTimeout(_phase: PipelineState, seconds: number): void {
  if (seconds <= 0) return;
  process.env.FORJA_PHASE_TIMEOUT_AT = new Date(Date.now() + seconds * 1000).toISOString();
}

export function isTimedOut(): boolean {
  const timeoutAt = process.env.FORJA_PHASE_TIMEOUT_AT;
  if (!timeoutAt) return false;
  if (!ISO8601_RE.test(timeoutAt)) return false;
  const deadline = new Date(timeoutAt).getTime();
  if (isNaN(deadline)) return false;
  return Date.now() > deadline;
}
