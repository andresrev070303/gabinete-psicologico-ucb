import * as tables from './schema.js';
import * as relations from './relations.js';

export const databaseSchema = { ...tables, ...relations };
