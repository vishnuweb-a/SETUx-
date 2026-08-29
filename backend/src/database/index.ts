export { DatabaseError, toAppError } from './database-error.js';
export {
  createIsolatedAuthClient,
  getDatabaseClient,
  type SetuxDatabaseClient,
} from './supabase-client.js';
export type { Database, Enums, Json, Tables, TablesInsert, TablesUpdate } from './database.types.js';
