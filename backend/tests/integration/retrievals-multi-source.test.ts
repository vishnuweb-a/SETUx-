import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * Phase 9 — retrieval across MULTIPLE government sources on one application.
 *
 * Phase 8 proved the pipeline with a single provider, so the questions it could
 * not ask are the ones here: with an application whose requirements are spread
 * over four different systems, does a grant for one source stay confined to it,
 * can one provider's data reach another provider's requirement, and does one
 * provider failing disturb a source that already succeeded.
 *
 * The application below is modelled on the seeded SCHOLARSHIP_MERIT service,
 * which names all four sources (supabase/seed/seed.sql).
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
vi.mock('../../src/modules/retrievals/retrieval.repository.js', () => ({
  listRetrievableRequirements: vi.fn(),
  listRetrievalsForApplication: vi.fn(),
  listRetrievedFields: vi.fn(),
  recordRetrievalSuccess: vi.fn(),
  recordRetrievalFailure: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const applicationRepository = await import(
  '../../src/modules/applications/application.repository.js'
);
const retrievalRepository = await import('../../src/modules/retrievals/retrieval.repository.js');
const {
  registerConnector,
  resetConnector,
  CONNECTOR_BEHAVIOUR,
  FakeIncomeConnector,
} = await import('../../src/connectors/index.js');
const { createApp } = await import('../../src/app.js');

const profileMock = vi.mocked(findProfileById);
const applications = Object.fromEntries(
  Object.entries(applicationRepository).map(([key, value]) => [key, vi.mocked(value)]),
) as {
  [K in keyof typeof applicationRepository]: ReturnType<
    typeof vi.mocked<(typeof applicationRepository)[K]>
  >;
};
const retrievals = Object.fromEntries(
  Object.entries(retrievalRepository).map(([key, value]) => [key, vi.mocked(value)]),
) as {
  [K in keyof typeof retrievalRepository]: ReturnType<
    typeof vi.mocked<(typeof retrievalRepository)[K]>
  >;
};

const app = createApp();
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-09-05T08:00:00.000Z';

/** One requirement per source, mirroring the seeded SCHOLARSHIP_MERIT service. */
const SOURCES = {
  identity: {
    requirementId: 'a1111111-1111-4111-8111-111111111111',
    sourceId: 'b1111111-1111-4111-8111-111111111111',
    requirementCode: 'IDENTITY',
    information: 'Identity Verification',
    sourceCode: 'MOCK_IDENTITY_API',
    sourceName: 'Identity Registry (Mock)',
    displayOrder: 1,
  },
  education: {
    requirementId: 'a2222222-2222-4222-8222-222222222222',
    sourceId: 'b2222222-2222-4222-8222-222222222222',
    requirementCode: 'EDUCATION_RECORD',
    information: 'Class 12 Result',
    sourceCode: 'MOCK_EDUCATION_API',
    sourceName: 'Education Department (Mock)',
    displayOrder: 2,
  },
  income: {
    requirementId: 'a3333333-3333-4333-8333-333333333333',
    sourceId: 'b3333333-3333-4333-8333-333333333333',
    requirementCode: 'INCOME_RECORD',
    information: 'Income Certificate',
    sourceCode: 'MOCK_INCOME_API',
    sourceName: 'Income & Revenue Department (Mock)',
    displayOrder: 3,
  },
  bank: {
    requirementId: 'a4444444-4444-4444-8444-444444444444',
    sourceId: 'b4444444-4444-4444-8444-444444444444',
    requirementCode: 'BANK_DETAILS',
    information: 'Bank Account Proof',
    sourceCode: 'DIGILOCKER_MOCK',
    sourceName: 'DigiLocker (Mock)',
    displayOrder: 4,
  },
} as const;

type SourceKey = keyof typeof SOURCES;

const SUBMITTED_APPLICATION = {
  id: APPLICATION_ID,
  application_number: 'STX-2026-000042',
  citizen_id: CITIZEN_ID,
  service_id: SERVICE_ID,
  status: 'SUBMITTED' as const,
  submitted_at: NOW,
  created_at: NOW,
  updated_at: NOW,
};

const SERVICE = {
  id: SERVICE_ID,
  code: 'SCHOLARSHIP_MERIT',
  name: 'National Merit Scholarship',
  department: 'Higher Education',
  status: 'ACTIVE',
};

/** Builds the requirement list with a consent status chosen per source. */
const requirements = (consents: Partial<Record<SourceKey, string | null>>) =>
  (Object.keys(SOURCES) as SourceKey[]).map((key) => ({
    requirementId: SOURCES[key].requirementId,
    requirementCode: SOURCES[key].requirementCode,
    information: SOURCES[key].information,
    dataSourceId: SOURCES[key].sourceId,
    sourceCode: SOURCES[key].sourceCode,
    sourceName: SOURCES[key].sourceName,
    consentStatus: consents[key] ?? null,
    displayOrder: SOURCES[key].displayOrder,
  }));

const successRow = (key: SourceKey, overrides: Record<string, unknown> = {}) => ({
  id: `c${SOURCES[key].requirementId.slice(1)}`,
  application_id: APPLICATION_ID,
  data_source_id: SOURCES[key].sourceId,
  consent_id: `d${SOURCES[key].sourceId.slice(1)}`,
  requirement_id: SOURCES[key].requirementId,
  request_reference: 'SYNTH-XX-ABCDEF123456',
  status: 'SUCCESS' as const,
  attempt_number: 1,
  response_metadata: { documentType: 'X', issuer: 'Y', issuedOn: NOW, labels: {}, simulated: true },
  error_code: null,
  error_message: null,
  completed_at: NOW,
  created_at: NOW,
  ...overrides,
});

const signIn = () => {
  getUser.mockResolvedValue({
    data: { user: { id: CITIZEN_ID, email: 'citizen@example.com' } },
    error: null,
  });
  profileMock.mockResolvedValue({
    id: CITIZEN_ID,
    email: 'citizen@example.com',
    role: 'CITIZEN',
    onboardingStatus: 'COMPLETED',
  });
};

const path = `/api/v1/applications/${APPLICATION_ID}/retrievals`;
const authorized = (method: 'get' | 'post') =>
  request(app)[method](path).set('Authorization', 'Bearer valid-token');
const retrieve = (key: SourceKey) =>
  authorized('post').send({ requirementId: SOURCES[key].requirementId });

beforeEach(() => {
  vi.clearAllMocks();
  // Restore healthy providers: some tests swap in failing ones.
  for (const source of Object.values(SOURCES)) resetConnector(source.sourceCode);
  signIn();
  applications.findApplicationById.mockResolvedValue(SUBMITTED_APPLICATION);
  applications.findServiceForApplication.mockResolvedValue(SERVICE);
  retrievals.listRetrievalsForApplication.mockResolvedValue([]);
  retrievals.listRetrievedFields.mockResolvedValue([]);
  retrievals.recordRetrievalFailure.mockResolvedValue(null);
});

describe('every seeded source is retrievable once consent is granted', () => {
  it.each(Object.keys(SOURCES) as SourceKey[])('retrieves %s', async (key) => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ identity: 'GRANTED', education: 'GRANTED', income: 'GRANTED', bank: 'GRANTED' }),
    );
    retrievals.recordRetrievalSuccess.mockResolvedValue(successRow(key));

    const response = await retrieve(key);

    expect(response.status).toBe(201);
    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledTimes(1);
    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APPLICATION_ID,
        citizenId: CITIZEN_ID,
        requirementId: SOURCES[key].requirementId,
      }),
    );
  });

  it('stores a provider reference traceable to the system that issued it', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ identity: 'GRANTED', education: 'GRANTED', income: 'GRANTED', bank: 'GRANTED' }),
    );
    const prefixes: Record<SourceKey, string> = {
      identity: 'SYNTH-ID-',
      education: 'SYNTH-EDU-',
      income: 'SYNTH-INC-',
      bank: 'SYNTH-DL-',
    };

    for (const key of Object.keys(SOURCES) as SourceKey[]) {
      retrievals.recordRetrievalSuccess.mockResolvedValue(successRow(key));
      await retrieve(key);
      const call = retrievals.recordRetrievalSuccess.mock.calls.at(-1)?.[0];
      expect(call?.requestReference).toContain(prefixes[key]);
    }
  });

  it('writes only field keys its own provider produces', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ income: 'GRANTED', education: 'GRANTED' }),
    );

    retrievals.recordRetrievalSuccess.mockResolvedValue(successRow('income'));
    await retrieve('income');
    const incomeValues = Object.keys(
      retrievals.recordRetrievalSuccess.mock.calls.at(-1)?.[0].values ?? {},
    );

    retrievals.recordRetrievalSuccess.mockResolvedValue(successRow('education'));
    await retrieve('education');
    const educationValues = Object.keys(
      retrievals.recordRetrievalSuccess.mock.calls.at(-1)?.[0].values ?? {},
    );

    expect(incomeValues).toContain('incomeBand');
    expect(educationValues).toContain('educationAggregatePercentage');
    // One provider's normalized output must never carry another's fields.
    expect(incomeValues.some((field) => field.startsWith('education'))).toBe(false);
    expect(educationValues.some((field) => field.startsWith('income'))).toBe(false);
  });
});

/**
 * Source-level consent isolation — the central Phase 9 security property.
 *
 * Phase 7 recorded consent per data source. A grant is therefore an answer
 * about ONE government system, and these prove it is never read as an answer
 * about another (Phase 9 §13, §25, §36).
 */
describe('a grant for one source never authorizes another', () => {
  const combinations: readonly (readonly [SourceKey, SourceKey])[] = [
    ['bank', 'education'],
    ['education', 'income'],
    ['income', 'education'],
    ['identity', 'income'],
    ['education', 'identity'],
    ['income', 'bank'],
  ];

  it.each(combinations)('%s GRANTED does not authorize %s', async (granted, blocked) => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ [granted]: 'GRANTED', [blocked]: 'DENIED' }),
    );

    const response = await retrieve(blocked);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RETRIEVAL_CONSENT_DENIED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
    // No attempt was made either: the connector was never reached.
    expect(retrievals.recordRetrievalFailure).not.toHaveBeenCalled();
  });

  it.each(combinations)('%s GRANTED does not authorize a PENDING %s', async (granted, blocked) => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ [granted]: 'GRANTED', [blocked]: 'PENDING' }),
    );

    const response = await retrieve(blocked);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RETRIEVAL_CONSENT_REQUIRED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('blocks a source with no consent record while another is granted', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ education: 'GRANTED', income: null }),
    );

    const response = await retrieve('income');

    expect(response.status).toBe(403);
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('lets the granted source through in the very same state', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ education: 'GRANTED', income: 'DENIED' }),
    );
    retrievals.recordRetrievalSuccess.mockResolvedValue(successRow('education'));

    expect((await retrieve('education')).status).toBe(201);
    expect((await retrieve('income')).status).toBe(403);
    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('reading a multi-source application', () => {
  it('reports each source independently, in display order', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ identity: 'GRANTED', education: 'PENDING', income: 'DENIED', bank: null }),
    );

    const response = await authorized('get');

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(4);
    expect(
      response.body.data.items.map((item: { availability: string }) => item.availability),
    ).toEqual(['AVAILABLE', 'CONSENT_REQUIRED', 'CONSENT_DENIED', 'CONSENT_REQUIRED']);
  });

  it('names each requirement and its own government system', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(requirements({}));

    const items = (await authorized('get')).body.data.items as readonly {
      information: string;
      source: string;
      isSimulated: boolean;
    }[];

    expect(items.map((item) => item.source)).toEqual([
      'Identity Registry (Mock)',
      'Education Department (Mock)',
      'Income & Revenue Department (Mock)',
      'DigiLocker (Mock)',
    ]);
    // Every Phase 9 provider is a simulation and says so.
    expect(items.every((item) => item.isSimulated)).toBe(true);
  });

  it('shows a retrieved value only against the source that supplied it', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ income: 'GRANTED', education: 'GRANTED' }),
    );
    retrievals.listRetrievalsForApplication.mockResolvedValue([
      successRow('income', {
        response_metadata: {
          documentType: 'INCOME_CERTIFICATE',
          issuer: 'Demo Revenue Department (Simulated)',
          issuedOn: NOW,
          labels: { incomeBand: 'Income band' },
          simulated: true,
        },
      }),
    ]);
    retrievals.listRetrievedFields.mockResolvedValue([
      { fieldCode: 'incomeBand', value: 'BELOW_THRESHOLD', sourceId: SOURCES.income.sourceId },
    ]);

    const items = (await authorized('get')).body.data.items as readonly {
      requirementId: string;
      availability: string;
      values: readonly unknown[];
    }[];
    const income = items.find((item) => item.requirementId === SOURCES.income.requirementId);
    const education = items.find((item) => item.requirementId === SOURCES.education.requirementId);

    expect(income).toMatchObject({
      availability: 'COMPLETED',
      values: [{ label: 'Income band', value: 'BELOW_THRESHOLD' }],
    });
    // The education requirement has its own consent and no retrieval of its
    // own; another source's value must not appear against it.
    expect(education).toMatchObject({ availability: 'AVAILABLE', values: [] });
  });

  it('never describes any source as verified', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ identity: 'GRANTED', education: 'GRANTED', income: 'GRANTED', bank: 'GRANTED' }),
    );
    retrievals.listRetrievalsForApplication.mockResolvedValue([
      successRow('identity'),
      successRow('income'),
    ]);

    // Retrieval is not verification, however many systems answered
    // (Phase 9 §22, §41).
    expect(JSON.stringify((await authorized('get')).body)).not.toMatch(/verified/iu);
  });
});

/**
 * Connector failure isolation (Phase 9 §27).
 *
 * One government system being down is an ordinary condition for an
 * interoperability layer. It must not disturb a source that already answered.
 */
describe('one failing provider does not disturb another', () => {
  beforeEach(() => {
    registerConnector(new FakeIncomeConnector(CONNECTOR_BEHAVIOUR.ALWAYS_FAIL));
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ education: 'GRANTED', income: 'GRANTED' }),
    );
  });

  it('reports the failure for the failing source only', async () => {
    retrievals.recordRetrievalFailure.mockResolvedValue(
      successRow('income', { status: 'FAILED', error_code: 'PROVIDER_UNAVAILABLE' }),
    );

    const response = await retrieve('income');

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('RETRIEVAL_PROVIDER_FAILED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('still retrieves the healthy source afterwards', async () => {
    retrievals.recordRetrievalFailure.mockResolvedValue(
      successRow('income', { status: 'FAILED', error_code: 'PROVIDER_UNAVAILABLE' }),
    );
    retrievals.recordRetrievalSuccess.mockResolvedValue(successRow('education'));

    await retrieve('income');
    const response = await retrieve('education');

    expect(response.status).toBe(201);
    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ requirementId: SOURCES.education.requirementId }),
    );
  });

  it('leaves the successful source COMPLETED while the failed one is RETRYABLE', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([
      successRow('education', {
        response_metadata: {
          documentType: 'EDUCATION_RECORD',
          issuer: 'Demo State Education Board (Simulated)',
          issuedOn: NOW,
          labels: { educationBoard: 'Board or university' },
          simulated: true,
        },
      }),
      successRow('income', {
        status: 'FAILED',
        request_reference: null,
        response_metadata: null,
        error_code: 'PROVIDER_UNAVAILABLE',
        error_message: 'The simulated revenue department did not respond.',
      }),
    ]);
    retrievals.listRetrievedFields.mockResolvedValue([
      {
        fieldCode: 'educationBoard',
        value: 'Demo State Education Board',
        sourceId: SOURCES.education.sourceId,
      },
    ]);

    const items = (await authorized('get')).body.data.items as readonly {
      requirementId: string;
      availability: string;
      failureReason: string | null;
      values: readonly unknown[];
    }[];
    const education = items.find((item) => item.requirementId === SOURCES.education.requirementId);
    const income = items.find((item) => item.requirementId === SOURCES.income.requirementId);

    // The failure must not make already-retrieved data disappear.
    expect(education).toMatchObject({ availability: 'COMPLETED' });
    expect(education?.values).toHaveLength(1);
    expect(income).toMatchObject({
      availability: 'RETRYABLE',
      failureReason: 'The simulated revenue department did not respond.',
      values: [],
    });
  });

  it('exposes no provider internals when a Phase 9 source fails', async () => {
    retrievals.recordRetrievalFailure.mockResolvedValue(null);

    const response = await retrieve('income');
    const body = JSON.stringify(response.body);

    expect(body).not.toMatch(/stack|at Object|node_modules/iu);
    expect(response.body.error.message).toBe(
      'The government system did not respond. You can try again.',
    );
  });
});

describe('idempotency is scoped to one requirement, not to the application', () => {
  beforeEach(() => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ education: 'GRANTED', income: 'GRANTED', identity: 'GRANTED' }),
    );
  });

  it('refuses a second retrieval of the same requirement', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([successRow('education')]);

    const response = await retrieve('education');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RETRIEVAL_ALREADY_COMPLETED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('still allows a different source after one has completed', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([successRow('education')]);
    retrievals.recordRetrievalSuccess.mockResolvedValue(successRow('income'));

    const response = await retrieve('income');

    expect(response.status).toBe(201);
    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ requirementId: SOURCES.income.requirementId }),
    );
  });
});

describe('forged input across multiple sources', () => {
  beforeEach(() => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ education: 'GRANTED', income: 'DENIED' }),
    );
  });

  it('rejects a body naming a connector or provider', async () => {
    for (const body of [
      { requirementId: SOURCES.education.requirementId, connector: 'FakeIncomeConnector' },
      { requirementId: SOURCES.education.requirementId, connectorName: 'income' },
      { requirementId: SOURCES.education.requirementId, provider: 'MOCK_INCOME_API' },
      { requirementId: SOURCES.education.requirementId, providerUrl: 'https://example.gov.in' },
      { requirementId: SOURCES.education.requirementId, sourceCode: 'MOCK_INCOME_API' },
    ]) {
      const response = await authorized('post').send(body);
      expect(response.status).toBe(400);
    }
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('cannot reach a denied source by naming the granted requirement', async () => {
    // The requirement determines the source; there is no second field to
    // redirect it with.
    retrievals.recordRetrievalSuccess.mockResolvedValue(successRow('education'));

    await retrieve('education');

    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ requirementId: SOURCES.education.requirementId }),
    );
    const call = retrievals.recordRetrievalSuccess.mock.calls.at(-1)?.[0];
    expect(Object.keys(call?.values ?? {}).some((field) => field.startsWith('income'))).toBe(false);
  });

  it('refuses a requirement id belonging to no requirement of this service', async () => {
    const response = await authorized('post').send({
      requirementId: '99999999-9999-4999-8999-999999999999',
    });

    expect(response.status).toBe(404);
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });
});

/**
 * The Phase 9 / Phase 10 boundary.
 *
 * Retrieval fetches; it does not verify. However many government systems have
 * answered, the application must stay SUBMITTED and no verification may exist
 * (Phase 9 §22, §51).
 */
describe('retrieval is not verification', () => {
  it('does not advance the application after every source has answered', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ identity: 'GRANTED', education: 'GRANTED', income: 'GRANTED', bank: 'GRANTED' }),
    );

    for (const key of Object.keys(SOURCES) as SourceKey[]) {
      retrievals.recordRetrievalSuccess.mockResolvedValue(successRow(key));
      expect((await retrieve(key)).status).toBe(201);
    }

    expect(applications.markApplicationSubmitted).not.toHaveBeenCalled();
    expect(applications.replaceApplicationFields).not.toHaveBeenCalled();
  });

  it('reports the application as SUBMITTED throughout', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue(
      requirements({ identity: 'GRANTED', education: 'GRANTED', income: 'GRANTED', bank: 'GRANTED' }),
    );
    retrievals.listRetrievalsForApplication.mockResolvedValue([
      successRow('identity'),
      successRow('education'),
      successRow('income'),
      successRow('bank'),
    ]);

    const body = JSON.stringify((await authorized('get')).body);

    expect(body).not.toMatch(/UNDER_VERIFICATION|UNDER_REVIEW/u);
    expect(body).not.toMatch(/verified|approved/iu);
  });
});
