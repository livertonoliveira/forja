import { addField, type Migration } from './primitives.js';

export const pre1ToV10: Migration = addField('schemaVersion', '1.0', 'pre-1.0', '1.0');
