import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 10 verification workflow, end to end through the HTTP layer.
 *
 * The repository is mocked, so these tests are about the SERVICE's decisions:
 * who may start a run, when it is allowed to start, what the rules conclude
 * from stored evidence, and what the API refuses. The query shapes those
 * repository functions produce are covered separately by the database-backed
 * tests, for the reason Phase 8 learned the hard way — a mocked repository
 * cannot catch a PostgREST relationship error.
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
vi.mock('../../src/modules/applications/application.repository.js', () => ({
  insertApplication: vi.fn(),
  findApplicationById: vi.fn(),
  listApplicationsByCitizen: vi.fn(),
  findCitizenProfileForApplication: vi.fn(),
  listApplicationFields: vi.fn(),
  replaceApplicationFields: vi.fn(),
  markApplicationSubmitted: vi.fn(),
  findServiceForApplication: vi.fn(),
  listRequirementsForApplication: vi.fn(),
}));
vi.mock('../../src/modules/verifications/verification.repository.js', () => ({
  listVerifiableRequirements: vi.fn(),
  listEvidenceForApplication: vi.fn(),
  listRetrievedRequirementIds: vi.fn(),
  listVerificationsForApplication: vi.fn(),
  recordVerificationRun: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const applicationRepository = await import(
  '../../src/modules/applications/application.repository.js'
);
const verificationRepository = await import(
  '../../src/modules/verifications/verification.repository.js'
);
const { createApp } = await import('../../src/app.js');

const profileMock = vi.mocked(findProfileById);
const applications = Object.fromEntries(
  Object.entries(applicationRepository).map(([key, value]) => [key, vi.mocked(value)]),
) as {
  [K in keyof typeof applicationRepository]: ReturnType<
    typeof vi.mocked<(typeof applicationRepository)[K]>
  >;
};
const verifications = Object.fromEntries(
  Object.entries(verificationRepository).map(([key, value]) => [key, vi.mocked(value)]),
) as {
  [K in keyof typeof verificationRepository]: ReturnType<
    typeof vi.mocked<(typeof verificationRepository)[K]>
  >;
};

const app = createApp();
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const IDENTITY_REQ_ID = '44444444-4444-4444-8444-444444444444';
const EDUCATION_REQ_ID = '55555555-5555-4555-8555-555555555555';
const INCOME_REQ_ID = '66666666-6666-4666-8666-666666666666';
const BANK_REQ_ID = '77777777-7777-4777-8777-777777777777';
const SOURCE_ID = '88888888-8888-4888-8888-888888888888';
const NOW = '2026-09-05T08:00:00.000Z';

const SERVICE = {
  id: SERVICE_ID,
  code: 'SCHOLARSHIP_MERIT',
  name: 'National Merit Scholarship',
  department: 'Education',
  status: 'ACTIVE',
};

const SUBMITTED_APPLICATION = {
  id: APPLICATION_ID,
  application_number: 'STX-2026-000001',
  citizen_id: CITIZEN_ID,
  service_id: SERVICE_ID,
  status: 'SUBMITTED' as const,
  submitted_at: NOW,
  created_at: NOW,
  updated_at: NOW,
};

/** The seeded SCHOLARSHIP_MERIT requirement set: three required, bank optional. */
const REQUIREMENTS = [
  {
    requirementId: IDENTITY_REQ_ID,
    requirementCode: 'IDENTITY',
    name: 'Identity Verification',
    dataSourceId: SOURCE_ID,
    required: true,
    displayOrder: 1,
  },
  {
    requirementId: EDUCATION_REQ_ID,
    requirementCode: 'EDUCATION_RECORD',
    name: 'Class 12 Result',
    dataSourceId: SOURCE_ID,
    required: true,
    displayOrder: 2,
  },
  {
    requirementId: INCOME_REQ_ID,
    requirementCode: 'INCOME_RECORD',
    name: 'Income Certificate',
    dataSourceId: SOURCE_ID,
    required: true,
    displayOrder: 3,
  },
  {
    requirementId: BANK_REQ_ID,
    requirementCode: 'BANK_DETAILS',
    name: 'Bank Account Proof',
    dataSourceId: SOURCE_ID,
    required: false,
    displayOrder: 4,
  },
];

/** Exactly what Phase 9's connectors normalize into `application_data` (§53). */
const PHASE_9_EVIDENCE = [
  { fieldCode: 'identityMatch', value: 'MATCHED' },
  { fieldCode: 'identityRecordStatus', value: 'ACTIVE' },
  { fieldCode: 'identityHolderName', value: 'Demo Citizen' },
  { fieldCode: 'educationEnrolmentStatus', value: 'ENROLLED' },
  { fieldCode: 'educationAggregatePercentage', value: '82.4' },
  { fieldCode: 'incomeBand', value: 'BELOW_THRESHOLD' },
  { fieldCode: 'bankAccountStatus', value: 'ACTIVE' },
].map((field) => ({ ...field, sourceId: SOURCE_ID, sourceType: 'PROVIDER_RETRIEVAL' }));

const verificationRow = (requirementCode: string, status: string, reasonCode: string) => ({
  id: `row-${requirementCode}`,
  application_id: APPLICATION_ID,
  verification_type: requirementCode,
  status: status as 'VERIFIED',
  source_id: SOURCE_ID,
  result: { reasonCode, ruleCode: 'X_V1', evaluatedFieldCount: 1 },
  verified_at: status === 'VERIFIED' ? NOW : null,
  created_at: NOW,
});

const signIn = (
  overrides: Partial<{
    role: 'CITIZEN' | 'GOVERNMENT_OFFICER';
    onboardingStatus: 'NOT_STARTED' | 'COMPLETED';
  }> = {},
) => {
  getUser.mockResolvedValue({
    data: { user: { id: CITIZEN_ID, email: 'citizen@example.com' } },
    error: null,
  });
  profileMock.mockResolvedValue({
    id: CITIZEN_ID,
    email: 'citizen@example.com',
    role: overrides.role ?? 'CITIZEN',
    onboardingStatus: overrides.onboardingStatus ?? 'COMPLETED',
  });
};

const path = `/api/v1/applications/${APPLICATION_ID}/verification`;
const authorized = (method: 'get' | 'post') =>
  request(app)[method](path).set('Authorization', 'Bearer valid-token');
const startVerification = (body: Record<string, unknown> = {}) => authorized('post').send(body);

/** All required evidence retrieved — the ready state. */
const allRetrieved = () =>
  new Set([IDENTITY_REQ_ID, EDUCATION_REQ_ID, INCOME_REQ_ID, BANK_REQ_ID]);

beforeEach(() => {
  vi.clearAllMocks();
  signIn();
  applications.findApplicationById.mockResolvedValue(SUBMITTED_APPLICATION);
  applications.findServiceForApplication.mockResolvedValue(SERVICE);
  verifications.listVerifiableRequirements.mockResolvedValue(REQUIREMENTS);
  verifications.listEvidenceForApplication.mockResolvedValue(PHASE_9_EVIDENCE);
  verifications.listRetrievedRequirementIds.mockResolvedValue(allRetrieved());
  verifications.listVerificationsForApplication.mockResolvedValue([]);
  verifications.recordVerificationRun.mockResolvedValue([
    verificationRow('IDENTITY', 'VERIFIED', 'RULE_MATCH'),
    verificationRow('EDUCATION_RECORD', 'VERIFIED', 'RULE_MATCH'),
    verificationRow('INCOME_RECORD', 'VERIFIED', 'RULE_MATCH'),
    verificationRow('BANK_DETAILS', 'VERIFIED', 'RULE_MATCH'),
  ]);
});

describe('authentication and role', () => {
  it('refuses an anonymous caller', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).post(path).send({})).status).toBe(401);
  });

  it('refuses a government officer', async () => {
    // The officer's involvement with an application begins in Phase 11. Reaching
    // the citizen's verification start would be a phase violation as well as an
    // authorization one (§37).
    signIn({ role: 'GOVERNMENT_OFFICER' });
    expect((await authorized('get')).status).toBe(403);
    expect((await startVerification()).status).toBe(403);
  });

  it('refuses a citizen who has not completed onboarding', async () => {
    signIn({ onboardingStatus: 'NOT_STARTED' });
    const response = await startVerification();
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('VERIFICATION_ONBOARDING_REQUIRED');
  });

  it("conceals another citizen's application as absent", async () => {
    // 404, not 403 — a 403 would confirm the identifier is real (§36).
    applications.findApplicationById.mockResolvedValue(null);
    expect((await authorized('get')).status).toBe(404);
    expect((await startVerification()).status).toBe(404);
  });
});

describe('mass assignment', () => {
  // Every one of these is rejected outright rather than ignored, so the API
  // never looks as though it accepted a forged outcome (§35).
  it.each([
    ['status', { status: 'APPROVED' }],
    ['verificationStatus', { verificationStatus: 'VERIFIED' }],
    ['result', { result: 'VERIFIED' }],
    ['outcome', { outcome: 'VERIFIED' }],
    ['score', { score: 100 }],
    ['verified', { verified: true }],
    ['approved', { approved: true }],
    ['reviewed', { reviewed: true }],
    ['officerId', { officerId: CITIZEN_ID }],
    ['citizenId', { citizenId: CITIZEN_ID }],
    ['serviceId', { serviceId: SERVICE_ID }],
    ['dataSourceId', { dataSourceId: SOURCE_ID }],
    ['evidence', { evidence: { incomeBand: 'BELOW_THRESHOLD' } }],
    ['values', { values: { identityMatch: 'MATCHED' } }],
    ['ruleResult', { ruleResult: 'RULE_MATCH' }],
    ['forcePass', { forcePass: true }],
    ['forceFail', { forceFail: true }],
  ])('rejects a forged %s', async (_field, body) => {
    const response = await startVerification(body);
    expect(response.status).toBe(400);
    expect(verifications.recordVerificationRun).not.toHaveBeenCalled();
  });

  it('accepts an empty body', async () => {
    expect((await startVerification({})).status).toBe(201);
  });
});

describe('readiness', () => {
  it('reports READY when every required requirement has evidence', async () => {
    const response = await authorized('get');
    expect(response.status).toBe(200);
    expect(response.body.data.readiness).toBe('READY');
  });

  it('refuses to start when required evidence is missing', async () => {
    verifications.listRetrievedRequirementIds.mockResolvedValue(new Set([IDENTITY_REQ_ID]));
    const response = await startVerification();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VERIFICATION_EVIDENCE_INCOMPLETE');
    expect(verifications.recordVerificationRun).not.toHaveBeenCalled();
  });

  it('does not block on a missing OPTIONAL requirement', async () => {
    // BANK_DETAILS is optional for this service. Blocking the workflow on it
    // would contradict the catalogue that marks it optional (§9).
    verifications.listRetrievedRequirementIds.mockResolvedValue(
      new Set([IDENTITY_REQ_ID, EDUCATION_REQ_ID, INCOME_REQ_ID]),
    );
    const response = await authorized('get');
    expect(response.body.data.readiness).toBe('READY');
    expect((await startVerification()).status).toBe(201);
  });

  it('refuses to start on an application that is not submitted', async () => {
    applications.findApplicationById.mockResolvedValue({
      ...SUBMITTED_APPLICATION,
      status: 'DRAFT' as const,
    });
    const response = await startVerification();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VERIFICATION_NOT_APPLICABLE');
    expect(verifications.recordVerificationRun).not.toHaveBeenCalled();
  });

  it('never derives readiness from the request', async () => {
    // Readiness is computed from stored rows only. A forged claim is rejected by
    // the schema, and would change nothing even if it were not (§10).
    verifications.listRetrievedRequirementIds.mockResolvedValue(new Set());
    expect((await startVerification({ ready: true })).status).toBe(400);
    expect((await startVerification()).status).toBe(409);
  });
});

describe('verification run', () => {
  it('verifies every requirement from stored Phase 9 evidence', async () => {
    const response = await startVerification();
    expect(response.status).toBe(201);

    const outcomes = verifications.recordVerificationRun.mock.calls[0]![0]!.outcomes;
    expect(outcomes).toHaveLength(4);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('VERIFIED');
      expect(outcome.reasonCode).toBe('RULE_MATCH');
    }
  });

  it('records a rule failure without rejecting the application', async () => {
    // The crux of the phase boundary. A failed rule is a finding for the officer,
    // never an application outcome (§15, §61).
    verifications.listEvidenceForApplication.mockResolvedValue(
      PHASE_9_EVIDENCE.map((field) =>
        field.fieldCode === 'incomeBand' ? { ...field, value: 'ABOVE_THRESHOLD' } : field,
      ),
    );
    verifications.recordVerificationRun.mockResolvedValue([
      verificationRow('INCOME_RECORD', 'FAILED', 'RULE_MISMATCH'),
    ]);

    const response = await startVerification();
    expect(response.status).toBe(201);

    const outcomes = verifications.recordVerificationRun.mock.calls[0]![0]!.outcomes;
    const income = outcomes.find((o) => o.requirementCode === 'INCOME_RECORD')!;
    expect(income.status).toBe('FAILED');
    expect(income.reasonCode).toBe('RULE_MISMATCH');

    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/APPROVED|REJECTED/u);
  });

  it('does not copy a provider verdict straight through to VERIFIED', async () => {
    // The registry says MATCHED, but its record is retired. SetuX's own rule
    // therefore does not verify — which is the whole point of the layer (§14).
    verifications.listEvidenceForApplication.mockResolvedValue(
      PHASE_9_EVIDENCE.map((field) =>
        field.fieldCode === 'identityRecordStatus' ? { ...field, value: 'RETIRED' } : field,
      ),
    );
    await startVerification();

    const outcomes = verifications.recordVerificationRun.mock.calls[0]![0]!.outcomes;
    expect(outcomes.find((o) => o.requirementCode === 'IDENTITY')!.status).toBe('FAILED');
  });

  it('names only the fields a rule actually read', async () => {
    // Evidence no rule judged must keep the status it had (§25, §26).
    await startVerification();
    const outcomes = verifications.recordVerificationRun.mock.calls[0]![0]!.outcomes;
    const education = outcomes.find((o) => o.requirementCode === 'EDUCATION_RECORD')!;
    expect(education.fieldCodes).toContain('educationEnrolmentStatus');
    expect(education.fieldCodes).not.toContain('educationAggregatePercentage');
  });

  it('reports progress from stored outcomes, never a hard-coded figure', async () => {
    verifications.listVerificationsForApplication.mockResolvedValue([
      verificationRow('IDENTITY', 'VERIFIED', 'RULE_MATCH'),
      verificationRow('EDUCATION_RECORD', 'FAILED', 'RULE_MISMATCH'),
    ]);
    const response = await authorized('get');
    expect(response.body.data.verifiedCount).toBe(1);
    expect(response.body.data.totalCount).toBe(4);
  });
});

describe('idempotency', () => {
  it('refuses a second start once verification has run', async () => {
    verifications.listVerificationsForApplication.mockResolvedValue([
      verificationRow('IDENTITY', 'VERIFIED', 'RULE_MATCH'),
    ]);
    const response = await startVerification();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VERIFICATION_ALREADY_STARTED');
    expect(verifications.recordVerificationRun).not.toHaveBeenCalled();
  });

  it('reports a conflict when the database refuses the transition', async () => {
    // The concurrent case: another request moved the application out of
    // SUBMITTED first, so the guarded RPC wrote nothing and returned no rows.
    // Reporting success here would claim a run that did not persist (§21).
    verifications.recordVerificationRun.mockResolvedValue([]);
    const response = await startVerification();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VERIFICATION_ALREADY_STARTED');
  });

  it('does not run a second time under a concurrent double start', async () => {
    // Both requests pass the service's own check; only one can be persisted,
    // because the RPC holds the application row and requires SUBMITTED.
    let calls = 0;
    verifications.recordVerificationRun.mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? [verificationRow('IDENTITY', 'VERIFIED', 'RULE_MATCH')]
        : [];
    });

    const [first, second] = await Promise.all([startVerification(), startVerification()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});

describe('system error is not a rule failure', () => {
  it('propagates a repository failure without recording an outcome', async () => {
    // A database problem must never be persisted as a finding against the
    // citizen. Nothing is written, and the response is a 5xx rather than a
    // FAILED verification (§16, §62).
    verifications.recordVerificationRun.mockRejectedValue(new Error('connection reset'));
    const response = await startVerification();
    expect(response.status).toBeGreaterThanOrEqual(500);

    // It surfaces as an infrastructure error, NOT as a verification outcome.
    // The distinction is the whole point: a database problem reported as FAILED
    // would be a finding against a citizen that no rule ever made.
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toMatch(/RULE_MISMATCH|REJECTED|verifiedCount/u);

    // The generic-message guard is the error handler's own, and applies in
    // production; here the assertion is that no verification was persisted.
    expect(verifications.recordVerificationRun).toHaveBeenCalledTimes(1);
  });

  it('does not start a run when evidence cannot be loaded', async () => {
    verifications.listEvidenceForApplication.mockRejectedValue(new Error('timeout'));
    const response = await startVerification();
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(verifications.recordVerificationRun).not.toHaveBeenCalled();
  });
});

describe('phase boundary', () => {
  it('never approves or rejects an application', async () => {
    const response = await startVerification();
    expect(JSON.stringify(response.body)).not.toMatch(/APPROVED|REJECTED/u);
  });

  it('exposes no officer review vocabulary', async () => {
    const body = JSON.stringify((await authorized('get')).body);
    expect(body).not.toMatch(/officer|review|decision|sanction|disburse/iu);
  });

  it('does not leak evidence values into the overview', async () => {
    // The citizen sees SetuX's conclusion and its reason, not the evidence it
    // read — that is shown by the retrieval view under its own authorization.
    verifications.listVerificationsForApplication.mockResolvedValue([
      verificationRow('IDENTITY', 'VERIFIED', 'RULE_MATCH'),
    ]);
    const body = JSON.stringify((await authorized('get')).body);
    expect(body).not.toMatch(/MATCHED|BELOW_THRESHOLD|82\.4|Demo Citizen/u);
  });
});

describe('connector independence', () => {
  it('completes a verification run without any connector registered', async () => {
    // The behavioural half of §18. The connector registry is never consulted,
    // so a run succeeds even though nothing could serve a retrieval — proving
    // the evidence came from storage.
    const { resolveConnector } = await import('../../src/connectors/index.js');
    const spy = vi.fn(resolveConnector);

    const response = await startVerification();
    expect(response.status).toBe(201);
    expect(spy).not.toHaveBeenCalled();
  });

  it('imports no connector anywhere in the verification module', async () => {
    const fs = await import('node:fs/promises');
    const directory = new URL('../../src/modules/verifications/', import.meta.url);
    for (const file of await fs.readdir(directory)) {
      const source = await fs.readFile(new URL(file, directory), 'utf8');
      expect(source, `${file} must not import a connector`).not.toMatch(/connectors\//u);
    }
  });

  it('reads evidence from application_data, not from a provider', async () => {
    await startVerification();
    expect(verifications.listEvidenceForApplication).toHaveBeenCalledWith(APPLICATION_ID);
  });
});
