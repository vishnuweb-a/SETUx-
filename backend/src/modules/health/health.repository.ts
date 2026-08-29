import { getDatabaseClient } from '../../database/index.js';

/**
 * The lightest query that proves the full path works: credentials are valid,
 * the connection is up, and the SetuX schema is present.
 *
 * `services` is seeded reference data with no personal information, so probing
 * it discloses nothing even if the result were ever surfaced.
 */
export const pingDatabase = async (): Promise<void> => {
  const { error } = await getDatabaseClient()
    .from('services')
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw error;
  }
};
