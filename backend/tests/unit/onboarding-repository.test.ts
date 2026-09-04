import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The onboarding repository's two write paths.
 *
 * `completeCitizenOnboarding` and `completeGovernmentOnboarding` prefer the
 * atomic PostgreSQL function and fall back to an ordered two-step write when
 * that migration has not been applied. Both paths are exercised here, because
 * the fallback's *ordering* is the property that makes a partial failure
 * recoverable (Phase 4 §25) and an untested ordering is an unverified claim.
 */

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return { ...actual, getDatabaseClient: () => ({ rpc, from }) };
});

const { completeCitizenOnboarding, completeGovernmentOnboarding } = await import(
  '../../src/modules/onboarding/onboarding.repository.js'
);
const { DatabaseError } = await import('../../src/database/index.js');

const FUNCTION_MISSING = { code: 'PGRST202', message: 'Could not find the function' };

const CITIZEN_INPUT = {
  userId: 'citizen-1',
  fullName: 'Rahul Sharma',
  governmentId: 'GOV123456',
  mobileNumber: '9876543210',
  dateOfBirth: '2002-08-15',
};

const OFFICER_INPUT = {
  userId: 'officer-1',
  organizationId: 'org-edu',
  departmentId: 'dept-higher-ed',
  fullName: 'Amit Kumar',
  employeeId: 'EMP-1024',
  designation: 'Application Officer',
  officialMobileNumber: '9876543210',
};

/** Records the order in which tables are written, for the ordering assertions. */
let writeOrder: string[];

/**
 * Stubs `from()` for the fallback path.
 *
 * @param options.upsertError      failure to report from the profile upsert
 * @param options.profileUpdated   whether the status UPDATE matched a row
 * @param options.departmentOrgId  organization the department resolves to
 */
const stubTables = (
  options: {
    upsertError?: { code?: string; message: string } | null;
    profileUpdated?: boolean;
    departmentOrgId?: string | null;
  } = {},
): void => {
  const { upsertError = null, profileUpdated = true, departmentOrgId = 'org-edu' } = options;

  from.mockImplementation((table: string) => {
    if (table === 'citizen_profiles' || table === 'government_profiles') {
      return {
        upsert: (...args: unknown[]) => {
          writeOrder.push(`upsert:${table}`);
          // Kept so the onConflict assertion can inspect it.
          upsertCalls.push({ table, args });
          return Promise.resolve({ error: upsertError });
        },
      };
    }

    if (table === 'profiles') {
      return {
        update: (values: Record<string, unknown>) => {
          writeOrder.push(`update:profiles:${String(values.onboarding_status)}`);
          const chain = {
            eq: () => chain,
            select: () => chain,
            maybeSingle: () =>
              Promise.resolve({ data: profileUpdated ? { id: 'row' } : null, error: null }),
          };
          return chain;
        },
      };
    }

    if (table === 'departments') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: departmentOrgId === null ? null : { organization_id: departmentOrgId },
            error: null,
          }),
      };
      return chain;
    }

    throw new Error(`Unexpected table: ${table}`);
  });
};

let upsertCalls: { table: string; args: unknown[] }[];

beforeEach(() => {
  vi.clearAllMocks();
  writeOrder = [];
  upsertCalls = [];
});

describe('completeCitizenOnboarding', () => {
  it('uses the atomic database function when it is available', async () => {
    rpc.mockResolvedValue({ error: null });

    await completeCitizenOnboarding(CITIZEN_INPUT);

    expect(rpc).toHaveBeenCalledWith('complete_citizen_onboarding', {
      p_user_id: 'citizen-1',
      p_full_name: 'Rahul Sharma',
      p_government_id: 'GOV123456',
      p_mobile_number: '9876543210',
      p_date_of_birth: '2002-08-15',
    });
    // The atomic path performs no table writes of its own.
    expect(from).not.toHaveBeenCalled();
  });

  it('writes the profile before the status flag when the function is missing', async () => {
    rpc.mockResolvedValue({ error: FUNCTION_MISSING });
    stubTables();

    await completeCitizenOnboarding(CITIZEN_INPUT);

    // The ordering is the recoverability guarantee: a failure after the first
    // write leaves saved data the user can resubmit, not a COMPLETED account
    // with no profile behind it.
    expect(writeOrder).toEqual(['upsert:citizen_profiles', 'update:profiles:COMPLETED']);
  });

  it('upserts on the owner column so a resubmission cannot create a second row', async () => {
    rpc.mockResolvedValue({ error: FUNCTION_MISSING });
    stubTables();

    await completeCitizenOnboarding(CITIZEN_INPUT);

    expect(upsertCalls).toHaveLength(1);
    const args = upsertCalls[0]?.args ?? [];
    expect(args[0]).toMatchObject({ user_id: 'citizen-1', government_id: 'GOV123456' });
    expect(args[1]).toEqual({ onConflict: 'user_id' });
  });

  it('does not mark onboarding complete when the profile write fails', async () => {
    rpc.mockResolvedValue({ error: FUNCTION_MISSING });
    stubTables({ upsertError: { code: '23505', message: 'duplicate key' } });

    await expect(completeCitizenOnboarding(CITIZEN_INPUT)).rejects.toThrow();

    expect(writeOrder).toEqual(['upsert:citizen_profiles']);
  });

  it('fails when the id does not name a profile of the expected role', async () => {
    rpc.mockResolvedValue({ error: FUNCTION_MISSING });
    stubTables({ profileUpdated: false });

    await expect(completeCitizenOnboarding(CITIZEN_INPUT)).rejects.toThrow(DatabaseError);
  });

  it('propagates a genuine database failure instead of falling back', async () => {
    rpc.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    await expect(completeCitizenOnboarding(CITIZEN_INPUT)).rejects.toThrow();

    // A real error must not be retried through the fallback: doing so would
    // turn one clear failure into two confusing ones.
    expect(from).not.toHaveBeenCalled();
  });
});

describe('completeGovernmentOnboarding', () => {
  it('uses the atomic database function when it is available', async () => {
    rpc.mockResolvedValue({ error: null });

    await completeGovernmentOnboarding(OFFICER_INPUT);

    expect(rpc).toHaveBeenCalledWith(
      'complete_government_onboarding',
      expect.objectContaining({ p_user_id: 'officer-1', p_organization_id: 'org-edu' }),
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('writes the profile before the status flag when the function is missing', async () => {
    rpc.mockResolvedValue({ error: FUNCTION_MISSING });
    stubTables();

    await completeGovernmentOnboarding(OFFICER_INPUT);

    expect(writeOrder).toEqual(['upsert:government_profiles', 'update:profiles:COMPLETED']);
  });

  it('rejects a department that belongs to a different organization', async () => {
    rpc.mockResolvedValue({ error: FUNCTION_MISSING });
    stubTables({ departmentOrgId: 'org-somewhere-else' });

    await expect(completeGovernmentOnboarding(OFFICER_INPUT)).rejects.toThrow(DatabaseError);

    // Nothing is written: the pairing check runs before the upsert, mirroring
    // the guard inside the SQL function.
    expect(writeOrder).toEqual([]);
  });

  it('rejects a department that does not exist', async () => {
    rpc.mockResolvedValue({ error: FUNCTION_MISSING });
    stubTables({ departmentOrgId: null });

    await expect(completeGovernmentOnboarding(OFFICER_INPUT)).rejects.toThrow(DatabaseError);
    expect(writeOrder).toEqual([]);
  });

  it('does not mark onboarding complete when the profile write fails', async () => {
    rpc.mockResolvedValue({ error: FUNCTION_MISSING });
    stubTables({ upsertError: { code: '23505', message: 'duplicate employee id' } });

    await expect(completeGovernmentOnboarding(OFFICER_INPUT)).rejects.toThrow();
    expect(writeOrder).toEqual(['upsert:government_profiles']);
  });
});
