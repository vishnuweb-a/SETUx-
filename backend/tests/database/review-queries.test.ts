import { describe, expect, it } from 'vitest';

/**
 * The Phase 11 review repository's queries, run against the REAL Supabase
 * project.
 *
 * Same reasoning as the Phase 8 and 10 database tests, and the same defect
 * behind them: a PostgREST query can be well-formed in the builder, pass every
 * mocked test, and still name a relationship the database rejects at runtime.
 * Phase 11 reads three tables no officer-facing code has read before —
 * `application_reviews`, and `applications`/`citizen_profiles` through a
 * department scope — so the risk is exactly the one those tests exist for.
 *
 * Skipped unless `SETUX_DB_TESTS=1` with real credentials. Run with:
 *
 *   SETUX_DB_TESTS=1 npm run test:db -w backend
 *
 * EVERY assertion here is non-mutating. The RPC IS exercised, but only with
 * inputs its guards must refuse — a citizen as reviewer, a blank rejection
 * reason, an out-of-scope department, a non-review-ready application. Each of
 * those returns before it writes anything, which is precisely the property
 * being tested; the test then confirms the row counts are unchanged. A test
 * that recorded a real decision would consume one of the demo's review-ready
 * applications.
 */
const url = process.env.SETUX_TEST_SUPABASE_URL ?? '';
const key = process.env.SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SETUX_DB_TESTS === '1' && url !== '' && key !== '';

if (enabled) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

const { getDatabaseClient } = await import('../../src/database/index.js');
const {
  countApplicationsByStatus,
  findApplicantForReview,
  findApplicationForOfficer,
  findOfficerScope,
  findReviewForApplication,
  listApplicationsForOfficer,
  listEvidenceForReview,
  listRequirementLabels,
  listVerificationDetail,
  listVerificationsForApplications,
  recordDecision,
} = await import('../../src/modules/reviews/review.repository.js');

/** The seeded synthetic officer. */
const findOfficer = async (): Promise<string | null> => {
  const { data } = await getDatabaseClient()
    .from('profiles')
    .select('id')
    .eq('role', 'GOVERNMENT_OFFICER')
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
};

const findCitizen = async (): Promise<string | null> => {
  const { data } = await getDatabaseClient()
    .from('profiles')
    .select('id')
    .eq('role', 'CITIZEN')
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
};

/** How many decisions and finalized applications exist right now. */
const snapshotCounts = async () => {
  const db = getDatabaseClient();
  const [reviews, finalized, events] = await Promise.all([
    db.from('application_reviews').select('id'),
    db.from('applications').select('id').in('status', ['APPROVED', 'REJECTED']),
    db.from('application_events').select('id').eq('step_code', 'DECISION'),
  ]);
  return {
    reviews: (reviews.data ?? []).length,
    finalized: (finalized.data ?? []).length,
    events: (events.data ?? []).length,
  };
};

describe.skipIf(!enabled)('Phase 11 review queries (database-backed)', () => {
  it('resolves the officer scope through the department/service join', async () => {
    const officerId = await findOfficer();
    expect(officerId).not.toBeNull();

    const scope = await findOfficerScope(officerId!);

    // The join RLS uses: government_profiles → departments.name → services.department.
    expect(scope).not.toBeNull();
    expect(scope!.departmentName.length).toBeGreaterThan(0);
    expect(scope!.officerName.length).toBeGreaterThan(0);
    expect(Array.isArray(scope!.serviceIds)).toBe(true);
  });

  it('lists applications in scope with applicant names, excluding drafts', async () => {
    const officerId = await findOfficer();
    const scope = await findOfficerScope(officerId!);

    const { rows, total } = await listApplicationsForOfficer({
      scope: scope!,
      page: 1,
      limit: 20,
    });

    expect(typeof total).toBe('number');
    for (const row of rows) {
      expect(row.status).not.toBe('DRAFT');
      expect(row.application_number).toMatch(/^STX-\d{4}-\d{6}$/);
      // The two-step citizen-name lookup resolved rather than falling through.
      expect(row.citizen_name.length).toBeGreaterThan(0);
      expect(row.service_name.length).toBeGreaterThan(0);
    }
  });

  it('reads one in-scope application, its evidence, verifications and applicant', async () => {
    const officerId = await findOfficer();
    const scope = await findOfficerScope(officerId!);
    const { rows } = await listApplicationsForOfficer({ scope: scope!, page: 1, limit: 20 });

    if (rows.length === 0) return;
    const target = rows[0]!;

    const application = await findApplicationForOfficer({
      applicationId: target.id,
      scope: scope!,
    });
    expect(application).not.toBeNull();
    expect(application!.service_code.length).toBeGreaterThan(0);

    // Each of these names a relationship or column PostgREST must accept.
    const [evidence, verifications, applicant, labels, review] = await Promise.all([
      listEvidenceForReview(target.id),
      listVerificationDetail(target.id),
      findApplicantForReview(target.citizen_id),
      listRequirementLabels(application!.service_id),
      findReviewForApplication(target.id),
    ]);

    expect(Array.isArray(evidence)).toBe(true);
    expect(Array.isArray(verifications)).toBe(true);
    expect(labels instanceof Map).toBe(true);
    // `review` is legitimately null on an undecided application; the assertion
    // is that the query ran, not that a decision exists.
    expect(review === null || typeof review.decision === 'string').toBe(true);
    expect(applicant === null || typeof applicant.full_name === 'string').toBe(true);
  });

  it('counts by status and summarizes verifications across applications', async () => {
    const officerId = await findOfficer();
    const scope = await findOfficerScope(officerId!);

    const counts = await countApplicationsByStatus(scope!);
    expect(counts.DRAFT).toBeUndefined();

    const { rows } = await listApplicationsForOfficer({ scope: scope!, page: 1, limit: 20 });
    const summaries = await listVerificationsForApplications(rows.map((row) => row.id));
    for (const summary of summaries) {
      expect(typeof summary.status).toBe('string');
    }
  });

  /**
   * Queue eligibility is outcome-independent, proved against the real rows.
   *
   * The mocked suite proves the SERVICE asks only for a status. This proves the
   * QUERY behaves that way against the actual schema: every application the
   * database holds in VERIFICATION, within a department's scope, is returned
   * regardless of what its verification rows say.
   *
   * Written from a live acceptance report where an application with a
   * REQUIRES_ACTION check was missing from an officer's queue. It was missing
   * because it belonged to another department — but "an outcome filter is
   * hiding it" was indistinguishable from that without this assertion.
   */
  it('returns every in-scope VERIFICATION application whatever its outcomes', async () => {
    const db = getDatabaseClient();

    // Take the scope from a department that actually has review-ready work,
    // rather than assuming the seeded officer's own department has any. The
    // point being tested is the outcome-independence of the query, and a
    // department with an empty queue cannot demonstrate it either way.
    const { data: pending } = await db
      .from('applications')
      .select('id, service_id, services ( department )')
      .eq('status', 'VERIFICATION');

    const byDepartment = new Map<string, string[]>();
    for (const row of pending ?? []) {
      const service = Array.isArray(row.services) ? row.services[0] : row.services;
      const department = (service as { department?: string } | null)?.department;
      if (!department) continue;
      byDepartment.set(department, [...(byDepartment.get(department) ?? []), row.id]);
    }
    if (byDepartment.size === 0) return;

    for (const [department, expectedIds] of byDepartment) {
      const { data: services } = await db.from('services').select('id').eq('department', department);

      const { rows } = await listApplicationsForOfficer({
        scope: {
          departmentId: '00000000-0000-4000-8000-000000000000',
          departmentName: department,
          officerName: 'Scope probe',
          serviceIds: (services ?? []).map((service) => service.id),
        },
        status: 'VERIFICATION',
        page: 1,
        limit: 50,
      });

      const returned = new Set(rows.map((row) => row.id));
      for (const id of expectedIds) {
        // Not "some of them" — every one. An outcome predicate anywhere in the
        // query would drop precisely the interesting ones.
        expect(returned.has(id)).toBe(true);
      }

      // And the outcomes those rows carry are reported, not filtered: an
      // application with a non-VERIFIED check is present with that check
      // counted as itself.
      const outcomes = await listVerificationsForApplications([...returned]);
      for (const outcome of outcomes) {
        expect(['VERIFIED', 'FAILED', 'REQUIRES_ACTION', 'PENDING', 'EXPIRED']).toContain(
          outcome.status,
        );
      }
    }
  });

  /**
   * A decided application must not linger in "Awaiting review".
   *
   * Asserted from the database's own rows rather than from a fixture: whatever
   * APPROVED and REJECTED applications the project holds, none of them may come
   * back under the VERIFICATION filter.
   */
  it('excludes finalized applications from the awaiting-review filter', async () => {
    const db = getDatabaseClient();

    const { data: finalized } = await db
      .from('applications')
      .select('id, services ( department )')
      .in('status', ['APPROVED', 'REJECTED']);
    if ((finalized ?? []).length === 0) return;

    const departments = new Set(
      (finalized ?? []).flatMap((row) => {
        const service = Array.isArray(row.services) ? row.services[0] : row.services;
        const department = (service as { department?: string } | null)?.department;
        return department ? [department] : [];
      }),
    );

    for (const department of departments) {
      const { data: services } = await db.from('services').select('id').eq('department', department);
      const scope = {
        departmentId: '00000000-0000-4000-8000-000000000000',
        departmentName: department,
        officerName: 'Scope probe',
        serviceIds: (services ?? []).map((service) => service.id),
      };

      const awaiting = await listApplicationsForOfficer({
        scope,
        status: 'VERIFICATION',
        page: 1,
        limit: 50,
      });
      for (const row of awaiting.rows) expect(row.status).toBe('VERIFICATION');

      // They are not lost — they are under their own filter.
      for (const status of ['APPROVED', 'REJECTED'] as const) {
        const decided = await listApplicationsForOfficer({ scope, status, page: 1, limit: 50 });
        for (const row of decided.rows) expect(row.status).toBe(status);
      }
    }
  });

  it('returns no application for an officer with an empty service scope', async () => {
    const emptyScope = {
      departmentId: '00000000-0000-4000-8000-000000000000',
      departmentName: 'Nonexistent',
      officerName: 'Nobody',
      serviceIds: [],
    };

    const { rows, total } = await listApplicationsForOfficer({
      scope: emptyScope,
      page: 1,
      limit: 20,
    });

    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });
});

describe.skipIf(!enabled)('Phase 11 decision RPC guards (database-backed)', () => {
  it('refuses every unauthorized or inapplicable decision, and writes nothing', async () => {
    const db = getDatabaseClient();
    const before = await snapshotCounts();

    const officerId = await findOfficer();
    const citizenId = await findCitizen();
    const scope = await findOfficerScope(officerId!);

    const { data: reviewReady } = await db
      .from('applications')
      .select('id')
      .eq('status', 'VERIFICATION')
      .in('service_id', scope!.serviceIds)
      .limit(1)
      .maybeSingle();

    const { data: notReviewReady } = await db
      .from('applications')
      .select('id')
      .eq('status', 'SUBMITTED')
      .limit(1)
      .maybeSingle();

    // A citizen is not a reviewer, however the id reaches the function.
    if (reviewReady) {
      expect(
        await recordDecision({
          applicationId: reviewReady.id,
          reviewerId: citizenId!,
          decision: 'APPROVED',
          remarks: null,
        }),
      ).toEqual([]);

      // A rejection with no reason is refused rather than raising a CHECK
      // violation.
      expect(
        await recordDecision({
          applicationId: reviewReady.id,
          reviewerId: officerId!,
          decision: 'REJECTED',
          remarks: '   ',
        }),
      ).toEqual([]);
    }

    // An application that has not completed verification cannot be decided.
    if (notReviewReady) {
      expect(
        await recordDecision({
          applicationId: notReviewReady.id,
          reviewerId: officerId!,
          decision: 'APPROVED',
          remarks: null,
        }),
      ).toEqual([]);
    }

    // A nonexistent application is refused without disclosing that it is absent.
    expect(
      await recordDecision({
        applicationId: '00000000-0000-4000-8000-000000000000',
        reviewerId: officerId!,
        decision: 'APPROVED',
        remarks: null,
      }),
    ).toEqual([]);

    // The point of the test: a refused decision is not a partial one.
    expect(await snapshotCounts()).toEqual(before);
  });

  it('keeps at most one final decision per application', async () => {
    // The partial unique index is what makes "a finalized application cannot be
    // decided again" survive any code path that forgets to check. Asserted
    // against real rows rather than trusted from the migration.
    const { data, error } = await getDatabaseClient()
      .from('application_reviews')
      .select('application_id, decision')
      .in('decision', ['APPROVED', 'REJECTED']);
    expect(error).toBeNull();

    const seen = new Set<string>();
    for (const row of data ?? []) {
      expect(seen.has(row.application_id)).toBe(false);
      seen.add(row.application_id);
    }
  });
});
