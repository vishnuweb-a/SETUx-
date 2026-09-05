import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * Phase 11 officer review, end to end through the HTTP layer.
 *
 * The repository is mocked, so these tests are about the SERVICE's decisions:
 * who may reach the officer API, which applications may be decided, that the
 * reviewer comes from the session, and that a decided application cannot be
 * decided again. The query shapes and the atomic commit itself are covered by
 * the database-backed tests, because a mocked repository cannot catch a
 * PostgREST relationship error or prove a transaction.
 */

const getUser = vi.fn();
vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return {
    ...actual,
    getDatabaseClient: () => ({ auth: { getUser } }),
    createIsolatedAuthClient: () => ({ auth: { getUser } }),
  };
});
vi.mock('../../src/modules/auth/auth.repository.js', () => ({
  findProfileById: vi.fn(),
  insertProfile: vi.fn(),
}));
vi.mock('../../src/modules/reviews/review.repository.js', () => ({
  findOfficerScope: vi.fn(),
  listApplicationsForOfficer: vi.fn(),
  findApplicationForOfficer: vi.fn(),
  listVerificationsForApplications: vi.fn(),
  listVerificationDetail: vi.fn(),
  listEvidenceForReview: vi.fn(),
  findApplicantForReview: vi.fn(),
  listRequirementLabels: vi.fn(),
  findReviewForApplication: vi.fn(),
  countApplicationsByStatus: vi.fn(),
  recordDecision: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const reviewRepository = await import('../../src/modules/reviews/review.repository.js');
const { createApp } = await import('../../src/app.js');

const profileMock = vi.mocked(findProfileById);
const reviews = Object.fromEntries(
  Object.entries(reviewRepository).map(([key, value]) => [key, vi.mocked(value)]),
) as {
  [K in keyof typeof reviewRepository]: ReturnType<
    typeof vi.mocked<(typeof reviewRepository)[K]>
  >;
};

const app = createApp();

const OFFICER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_OFFICER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CITIZEN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const APPLICATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SERVICE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DEPARTMENT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REVIEW_ID = '11111111-2222-4333-8444-555555555555';
const NOW = '2026-09-05T08:00:00.000Z';

const SCOPE = {
  departmentId: DEPARTMENT_ID,
  departmentName: 'Higher Education',
  officerName: 'Demo Officer',
  serviceIds: [SERVICE_ID],
};

type Status = 'SUBMITTED' | 'VERIFICATION' | 'APPROVED' | 'REJECTED';

const applicationAt = (status: Status) => ({
  id: APPLICATION_ID,
  application_number: 'STX-2026-000013',
  citizen_id: CITIZEN_ID,
  service_id: SERVICE_ID,
  service_code: 'SCHOLARSHIP_MERIT',
  service_name: 'National Merit Scholarship',
  citizen_name: '',
  status,
  submitted_at: NOW,
  updated_at: NOW,
});

const signIn = (
  overrides: Partial<{
    role: 'CITIZEN' | 'GOVERNMENT_OFFICER';
    onboardingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    userId: string;
  }> = {},
) => {
  const userId = overrides.userId ?? OFFICER_ID;
  getUser.mockResolvedValue({
    data: { user: { id: userId, email: 'officer@setux.test' } },
    error: null,
  });
  profileMock.mockResolvedValue({
    id: userId,
    email: 'officer@setux.test',
    role: overrides.role ?? 'GOVERNMENT_OFFICER',
    onboardingStatus: overrides.onboardingStatus ?? 'COMPLETED',
  });
};

const BASE = '/api/v1/government/review';
const detailPath = `${BASE}/applications/${APPLICATION_ID}`;
const decisionPath = `${detailPath}/decision`;

const authorized = (method: 'get' | 'post', path: string) =>
  request(app)[method](path).set('Authorization', 'Bearer valid-token');

const decide = (body: Record<string, unknown>) => authorized('post', decisionPath).send(body);

beforeEach(() => {
  vi.clearAllMocks();
  signIn();
  reviews.findOfficerScope.mockResolvedValue(SCOPE);
  reviews.findApplicationForOfficer.mockResolvedValue(applicationAt('VERIFICATION'));
  reviews.listApplicationsForOfficer.mockResolvedValue({
    rows: [applicationAt('VERIFICATION')],
    total: 1,
  });
  reviews.listVerificationsForApplications.mockResolvedValue([
    { application_id: APPLICATION_ID, status: 'VERIFIED' },
    { application_id: APPLICATION_ID, status: 'REQUIRES_ACTION' },
  ]);
  reviews.listVerificationDetail.mockResolvedValue([
    {
      verification_type: 'IDENTITY',
      status: 'VERIFIED',
      result: { reasonCode: 'RULE_MATCH' },
      verified_at: NOW,
    },
  ]);
  reviews.listEvidenceForReview.mockResolvedValue([
    {
      field_code: 'identityHolderName',
      field_value: 'Asha Menon',
      source_type: 'PROVIDER_RETRIEVAL',
      verification_status: 'VERIFIED',
      verified_at: NOW,
      source_name: 'Identity Registry (Mock)',
    },
  ]);
  reviews.findApplicantForReview.mockResolvedValue({
    full_name: 'Asha Menon',
    government_id: 'SYN-0001',
    mobile_number: '9000000001',
    date_of_birth: '2004-01-01',
  });
  reviews.listRequirementLabels.mockResolvedValue(
    new Map([['IDENTITY', { name: 'Identity Verification', required: true }]]),
  );
  reviews.findReviewForApplication.mockResolvedValue(null);
  reviews.countApplicationsByStatus.mockResolvedValue({
    VERIFICATION: 2,
    APPROVED: 3,
    REJECTED: 1,
  });
  reviews.recordDecision.mockResolvedValue([
    {
      id: REVIEW_ID,
      application_id: APPLICATION_ID,
      reviewer_id: OFFICER_ID,
      department_id: DEPARTMENT_ID,
      decision: 'APPROVED',
      remarks: null,
      reviewed_at: NOW,
    },
  ]);
});

describe('officer review — access control', () => {
  it('refuses an anonymous caller with 401', async () => {
    for (const path of [BASE, `${BASE}/applications`, detailPath]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(401);
    }

    const decision = await request(app).post(decisionPath).send({ decision: 'APPROVED' });
    expect(decision.status).toBe(401);
    expect(reviews.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses a citizen with 403 on every officer endpoint', async () => {
    signIn({ role: 'CITIZEN' });

    for (const path of [BASE, `${BASE}/applications`, detailPath]) {
      const response = await authorized('get', path);
      expect(response.status).toBe(403);
    }

    const decision = await decide({ decision: 'APPROVED' });
    expect(decision.status).toBe(403);
    // The gate is what refuses, not a failed write further down.
    expect(reviews.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses an officer who has not completed onboarding', async () => {
    signIn({ onboardingStatus: 'IN_PROGRESS' });

    const response = await authorized('get', BASE);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('REVIEW_ONBOARDING_REQUIRED');
  });
});

describe('officer review — queue and detail', () => {
  it('lists review-ready applications with verification counts', async () => {
    const response = await authorized('get', `${BASE}/applications?status=VERIFICATION`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);

    const [item] = response.body.data.items;
    expect(item.applicationNumber).toBe('STX-2026-000013');
    expect(item.status).toBe('VERIFICATION');
    expect(item.decision).toBeNull();
    // Counts, not a verdict: REQUIRES_ACTION is reported as itself rather than
    // folded into a failure.
    expect(item.verificationSummary).toEqual({
      verified: 1,
      failed: 0,
      requiresAction: 1,
      total: 2,
    });
  });

  it('reports dashboard counts from persisted rows only', async () => {
    const response = await authorized('get', BASE);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      awaitingReview: 2,
      approved: 3,
      rejected: 1,
      totalReviewed: 4,
      department: 'Higher Education',
    });
  });

  it('returns evidence, provenance and verification outcomes on the detail', async () => {
    const response = await authorized('get', detailPath);

    expect(response.status).toBe(200);
    expect(response.body.data.canDecide).toBe(true);
    expect(response.body.data.review).toBeNull();
    expect(response.body.data.verifications[0]).toMatchObject({
      requirementCode: 'IDENTITY',
      information: 'Identity Verification',
      status: 'VERIFIED',
      reasonCode: 'RULE_MATCH',
    });
    // Evidence is grouped under the system that issued it, with a readable
    // label rather than the raw field code.
    expect(response.body.data.evidence[0]).toMatchObject({
      sourceName: 'Identity Registry (Mock)',
      items: [expect.objectContaining({ label: 'Identity Holder Name', value: 'Asha Menon' })],
    });
  });

  it('conceals an application outside the officer department as absent', async () => {
    reviews.findApplicationForOfficer.mockResolvedValue(null);

    const response = await authorized('get', detailPath);
    expect(response.status).toBe(404);
  });
});

describe('officer review — the decision', () => {
  it('records an approval and returns the re-read authoritative state', async () => {
    reviews.findApplicationForOfficer
      .mockResolvedValueOnce(applicationAt('VERIFICATION'))
      .mockResolvedValueOnce(applicationAt('APPROVED'));
    reviews.findReviewForApplication.mockResolvedValue({
      id: REVIEW_ID,
      application_id: APPLICATION_ID,
      reviewer_id: OFFICER_ID,
      department_id: DEPARTMENT_ID,
      decision: 'APPROVED',
      remarks: null,
      reviewed_at: NOW,
      reviewer_name: 'Demo Officer',
    });

    const response = await decide({ decision: 'APPROVED' });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('APPROVED');
    expect(response.body.data.canDecide).toBe(false);
    expect(response.body.data.review).toMatchObject({
      decision: 'APPROVED',
      reviewerName: 'Demo Officer',
    });
  });

  it('records a rejection with its reason', async () => {
    reviews.recordDecision.mockResolvedValue([
      {
        id: REVIEW_ID,
        application_id: APPLICATION_ID,
        reviewer_id: OFFICER_ID,
        department_id: DEPARTMENT_ID,
        decision: 'REJECTED',
        remarks: 'Income exceeds the scheme threshold.',
        reviewed_at: NOW,
      },
    ]);

    const response = await decide({
      decision: 'REJECTED',
      remarks: 'Income exceeds the scheme threshold.',
    });

    expect(response.status).toBe(201);
    expect(reviews.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'REJECTED',
        remarks: 'Income exceeds the scheme threshold.',
      }),
    );
  });

  it('refuses a rejection with no reason', async () => {
    const response = await decide({ decision: 'REJECTED' });

    expect(response.status).toBe(400);
    expect(reviews.recordDecision).not.toHaveBeenCalled();
  });

  it('takes the reviewer from the session, never the request body', async () => {
    await decide({
      decision: 'APPROVED',
      // Every one of these is a forgery attempt.
      reviewerId: OTHER_OFFICER_ID,
      reviewer_id: OTHER_OFFICER_ID,
      officerId: OTHER_OFFICER_ID,
    });

    // Rejected outright rather than silently ignored — the API must not look as
    // though it accepted them.
    expect(reviews.recordDecision).not.toHaveBeenCalled();

    const clean = await decide({ decision: 'APPROVED' });
    expect(clean.status).toBe(201);
    expect(reviews.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerId: OFFICER_ID }),
    );
  });

  it('rejects a forged status or decided-at field', async () => {
    for (const body of [
      { decision: 'APPROVED', status: 'APPROVED' },
      { decision: 'APPROVED', applicationStatus: 'APPROVED' },
      { decision: 'APPROVED', reviewedAt: '2020-01-01T00:00:00.000Z' },
      { decision: 'APPROVED', departmentId: DEPARTMENT_ID },
    ]) {
      const response = await decide(body);
      expect(response.status).toBe(400);
    }

    expect(reviews.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses a decision this phase does not own', async () => {
    const response = await decide({ decision: 'REQUESTED_INFO', remarks: 'Send more.' });

    expect(response.status).toBe(400);
    expect(reviews.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses to decide an application that has not completed verification', async () => {
    reviews.findApplicationForOfficer.mockResolvedValue(applicationAt('SUBMITTED'));

    const response = await decide({ decision: 'APPROVED' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REVIEW_NOT_APPLICABLE');
    expect(reviews.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses a second, contradictory decision on a finalized application', async () => {
    reviews.findApplicationForOfficer.mockResolvedValue(applicationAt('APPROVED'));

    const response = await decide({ decision: 'REJECTED', remarks: 'Changed my mind.' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REVIEW_NOT_APPLICABLE');
    expect(reviews.recordDecision).not.toHaveBeenCalled();
  });

  it('reports a conflict when the database refuses the transition', async () => {
    // The concurrent case: the service saw VERIFICATION, but another officer
    // committed first and the RPC's FOR UPDATE guard returned nothing.
    reviews.recordDecision.mockResolvedValue([]);

    const response = await decide({ decision: 'APPROVED' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REVIEW_ALREADY_DECIDED');
  });
});

/**
 * Verification outcomes are ADVISORY — they must never gate the queue.
 *
 * These exist because of a live Phase 11 acceptance report: an application
 * whose COMMUNITY_RECORD came back REQUIRES_ACTION was absent from "Awaiting
 * review", and the natural suspicion was that queue eligibility had been
 * written as "every check VERIFIED". It had not been — the application simply
 * belonged to another department — but nothing in the suite PROVED the
 * eligibility rule was outcome-independent, so the wrong answer was cheap to
 * reach and expensive to rule out.
 *
 * Each case below is a state Phase 10 can genuinely leave behind. All three
 * must reach a human, because the alternative to showing a FAILED application
 * to an officer is deciding it automatically, which is exactly what Phase 11
 * exists to prevent (§4, §13, §14).
 */
describe('officer review — verification outcomes never gate the queue', () => {
  const verificationsOf = (...statuses: readonly string[]) =>
    statuses.map((status) => ({ application_id: APPLICATION_ID, status }));

  const queueOnce = async (...statuses: readonly string[]) => {
    reviews.listVerificationsForApplications.mockResolvedValue(verificationsOf(...statuses));
    const response = await authorized('get', `${BASE}/applications?status=VERIFICATION`);
    expect(response.status).toBe(200);
    return response.body.data;
  };

  it('lists an application whose checks are all VERIFIED, without deciding it', async () => {
    const data = await queueOnce('VERIFIED', 'VERIFIED', 'VERIFIED');

    expect(data.items).toHaveLength(1);
    expect(data.items[0].verificationSummary).toEqual({
      verified: 3,
      failed: 0,
      requiresAction: 0,
      total: 3,
    });
    // A clean sheet is evidence, not an approval. The row is still awaiting a
    // person, and carries no decision.
    expect(data.items[0].status).toBe('VERIFICATION');
    expect(data.items[0].decision).toBeNull();
  });

  it('lists an application carrying REQUIRES_ACTION — the case that reports human review', async () => {
    // The exact shape from the acceptance report: IDENTITY verified,
    // COMMUNITY_RECORD needing a person, INCOME_RECORD verified.
    const data = await queueOnce('VERIFIED', 'REQUIRES_ACTION', 'VERIFIED');

    expect(data.items).toHaveLength(1);
    expect(data.items[0].verificationSummary).toEqual({
      verified: 2,
      failed: 0,
      requiresAction: 1,
      total: 3,
    });
    // REQUIRES_ACTION is reported as itself — never folded into `failed`, and
    // never a reason to withhold the row.
    expect(data.items[0].decision).toBeNull();
  });

  it('lists an application carrying FAILED, without auto-rejecting it', async () => {
    const data = await queueOnce('VERIFIED', 'FAILED', 'VERIFIED');

    expect(data.items).toHaveLength(1);
    expect(data.items[0].verificationSummary).toEqual({
      verified: 2,
      failed: 1,
      requiresAction: 0,
      total: 3,
    });
    expect(data.items[0].status).toBe('VERIFICATION');
    expect(data.items[0].decision).toBeNull();
  });

  it('asks the repository for the status only — never for an outcome', async () => {
    await authorized('get', `${BASE}/applications?status=VERIFICATION`);

    // The eligibility rule in one assertion: scope, status, paging. If a
    // verification predicate is ever added to queue eligibility, it has to
    // pass through here, and this fails.
    expect(reviews.listApplicationsForOfficer).toHaveBeenCalledWith({
      scope: SCOPE,
      status: 'VERIFICATION',
      page: 1,
      limit: 20,
    });
  });

  it('offers a decision on a REQUIRES_ACTION application rather than pre-empting one', async () => {
    reviews.listVerificationDetail.mockResolvedValue([
      {
        verification_type: 'IDENTITY',
        status: 'VERIFIED',
        result: { reasonCode: 'RULE_MATCH' },
        verified_at: NOW,
      },
      {
        verification_type: 'COMMUNITY_RECORD',
        status: 'REQUIRES_ACTION',
        result: { reasonCode: 'NO_RULE_DEFINED' },
        verified_at: null,
      },
      {
        verification_type: 'INCOME_RECORD',
        status: 'VERIFIED',
        result: { reasonCode: 'RULE_MATCH' },
        verified_at: NOW,
      },
    ]);

    const response = await authorized('get', detailPath);

    expect(response.status).toBe(200);
    // The officer may still decide: an unresolvable automatic check is the
    // reason their judgement is wanted, not a reason to lock the screen.
    expect(response.body.data.canDecide).toBe(true);
    expect(response.body.data.review).toBeNull();
    // The outcome reaches the officer intact — not rewritten as FAILED, and
    // carrying the reason Phase 10 recorded.
    expect(response.body.data.verifications).toContainEqual(
      expect.objectContaining({
        requirementCode: 'COMMUNITY_RECORD',
        status: 'REQUIRES_ACTION',
        reasonCode: 'NO_RULE_DEFINED',
      }),
    );
  });
});

/**
 * A decided application leaves "Awaiting review" and appears under its own
 * filter. The separation is the status filter passed to the repository, so
 * these assert the filter actually travels (§15).
 */
describe('officer review — finalized applications leave the queue', () => {
  it('passes each final filter through to the repository', async () => {
    for (const status of ['APPROVED', 'REJECTED'] as const) {
      reviews.listApplicationsForOfficer.mockResolvedValue({
        rows: [applicationAt(status)],
        total: 1,
      });

      const response = await authorized('get', `${BASE}/applications?status=${status}`);

      expect(response.status).toBe(200);
      expect(reviews.listApplicationsForOfficer).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
      );
      // The row reports the decision it carries rather than a null awaiting one.
      expect(response.body.data.items[0].decision).toBe(status);
    }
  });

  it('refuses a queue filter for a status that never reaches an officer', async () => {
    for (const status of ['DRAFT', 'SUBMITTED']) {
      const response = await authorized('get', `${BASE}/applications?status=${status}`);
      expect(response.status).toBe(400);
    }
  });
});

/**
 * Phase 11 status semantics: VISIBLE is not the same as REVIEWABLE.
 *
 * The repository can list every non-DRAFT application in an officer's
 * department, and that generic capability is deliberate. These tests pin the
 * narrower promise the QUEUE makes on top of it: "Awaiting review" means
 * VERIFICATION and nothing else, so a SUBMITTED application — visible, but not
 * yet verified — never reaches a screen offering Approve and Reject.
 */
describe('officer review — awaiting review means VERIFICATION only', () => {
  const awaitingReview = () => authorized('get', `${BASE}/applications?status=VERIFICATION`);

  it('asks the repository for VERIFICATION, not for everything non-DRAFT', async () => {
    const response = await awaitingReview();

    expect(response.status).toBe(200);
    expect(reviews.listApplicationsForOfficer).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'VERIFICATION' }),
    );
  });

  it('includes an application in VERIFICATION', async () => {
    const response = await awaitingReview();

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].status).toBe('VERIFICATION');
  });

  it.each(['SUBMITTED', 'APPROVED', 'REJECTED'] as const)(
    'never asks for %s when listing awaiting review',
    async (status) => {
      await awaitingReview();

      expect(reviews.listApplicationsForOfficer).not.toHaveBeenCalledWith(
        expect.objectContaining({ status }),
      );
    },
  );

  it('sends the status to the API rather than filtering a broad response', async () => {
    for (const status of ['APPROVED', 'REJECTED'] as const) {
      vi.clearAllMocks();
      signIn();
      reviews.findOfficerScope.mockResolvedValue(SCOPE);
      reviews.listApplicationsForOfficer.mockResolvedValue({
        rows: [applicationAt(status)],
        total: 1,
      });
      reviews.listVerificationsForApplications.mockResolvedValue([]);

      const response = await authorized('get', `${BASE}/applications?status=${status}`);

      expect(response.status).toBe(200);
      expect(reviews.listApplicationsForOfficer).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
      );
      expect(response.body.data.items.every((item: { status: string }) => item.status === status)).toBe(
        true,
      );
    }
  });

  /**
   * The rule that does not depend on the queue at all.
   *
   * Hiding the buttons is a courtesy to the officer; this is the guard. An
   * officer who reaches a SUBMITTED application by typing its URL — or a client
   * that decides for itself that it may act — is refused by the server.
   */
  it('refuses a decision on a SUBMITTED application even when asked directly', async () => {
    reviews.findApplicationForOfficer.mockResolvedValue(applicationAt('SUBMITTED'));

    const response = await decide({ decision: 'APPROVED' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REVIEW_NOT_APPLICABLE');
    expect(reviews.recordDecision).not.toHaveBeenCalled();
  });

  it('reports canDecide false on a SUBMITTED application', async () => {
    reviews.findApplicationForOfficer.mockResolvedValue(applicationAt('SUBMITTED'));

    const response = await authorized('get', detailPath);

    expect(response.status).toBe(200);
    expect(response.body.data.canDecide).toBe(false);
  });

  it('counts awaiting review as VERIFICATION alone, not as all non-DRAFT', async () => {
    reviews.countApplicationsByStatus.mockResolvedValue({
      SUBMITTED: 6,
      VERIFICATION: 3,
      APPROVED: 1,
      REJECTED: 1,
    });

    const response = await authorized('get', BASE);

    expect(response.status).toBe(200);
    // 3, not 11: the six SUBMITTED are visible but not review candidates.
    expect(response.body.data.awaitingReview).toBe(3);
    expect(response.body.data.approved).toBe(1);
    expect(response.body.data.rejected).toBe(1);
    expect(response.body.data.totalReviewed).toBe(2);
  });
});
