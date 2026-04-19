import { describe, it, expect } from 'vitest';
import { VALID_TRANSITIONS } from '../../src/engine/fsm.js';
import { RunStateEnum } from '../../src/schemas/run.js';

describe('run-state contract — bidirectional alignment between FSM and RunStateEnum', () => {
  it('every key in VALID_TRANSITIONS is a valid RunStateEnum value', () => {
    for (const state of Object.keys(VALID_TRANSITIONS)) {
      expect(() => RunStateEnum.parse(state)).not.toThrow();
    }
  });

  it('every target state in VALID_TRANSITIONS values is a valid RunStateEnum value', () => {
    for (const state of Object.values(VALID_TRANSITIONS).flat()) {
      expect(() => RunStateEnum.parse(state)).not.toThrow();
    }
  });

  it('FSM states and RunStateEnum.options are identical sets', () => {
    const fsmStates = new Set([
      ...Object.keys(VALID_TRANSITIONS),
      ...Object.values(VALID_TRANSITIONS).flat(),
    ]);
    expect(fsmStates).toEqual(new Set(RunStateEnum.options));
  });
});
