import type { Migration } from './primitives.js';
import { pre1ToV10 } from './m_pre1_to_v10.js';

export const registry: Migration[] = [pre1ToV10];
