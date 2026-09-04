import { describe, expect, it, vi } from 'vitest';
import {
  CONNECTOR_BEHAVIOUR,
  CONNECTOR_ERROR_CODES,
  ConnectorError,
  FakeDigiLockerConnector,
  FakeEducationConnector,
  FakeIdentityConnector,
  FakeIncomeConnector,
  resolveConnector,
  type GovernmentDataConnector,
} from '../../src/connectors/index.js';

/**
 * The Phase 9 government connectors.
 *
 * These are table-driven on purpose. Every connector implements the same
 * contract, so the properties that matter — determinism, normalization, zero
 * network, no credential, refusal of a requirement it does not serve — are
 * asserted identically for all four rather than drifting per provider. The
 * DigiLocker connector is included so the Phase 8 provider is held to the same
 * bar after the Phase 9 refactor onto the shared helpers.
 */

const CORRELATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

interface ConnectorCase {
  readonly label: string;
  readonly sourceCode: string;
  readonly connector: GovernmentDataConnector;
  readonly failing: GovernmentDataConnector;
  /** Requirement codes the seeded catalogue routes to this source. */
  readonly supported: readonly string[];
  /** A requirement belonging to a DIFFERENT source. */
  readonly foreign: string;
  readonly referencePrefix: string;
  readonly issuer: string;
  /** A field key this provider is expected to produce after normalization. */
  readonly fieldKey: string;
  /** A provider-native attribute name that must NOT survive normalization. */
  readonly providerAttribute: string;
}

const cases: readonly ConnectorCase[] = [
  {
    label: 'fake identity registry',
    sourceCode: 'MOCK_IDENTITY_API',
    connector: new FakeIdentityConnector(),
    failing: new FakeIdentityConnector(CONNECTOR_BEHAVIOUR.ALWAYS_FAIL),
    supported: ['IDENTITY'],
    foreign: 'INCOME_RECORD',
    referencePrefix: 'ID',
    issuer: 'Demo Identity Registry (Simulated)',
    fieldKey: 'identityMatch',
    providerAttribute: 'match_result',
  },
  {
    label: 'fake education department',
    sourceCode: 'MOCK_EDUCATION_API',
    connector: new FakeEducationConnector(),
    failing: new FakeEducationConnector(CONNECTOR_BEHAVIOUR.ALWAYS_FAIL),
    supported: ['EDUCATION_RECORD'],
    foreign: 'IDENTITY',
    referencePrefix: 'EDU',
    issuer: 'Demo State Education Board (Simulated)',
    fieldKey: 'educationAggregatePercentage',
    providerAttribute: 'aggregate_pct',
  },
  {
    label: 'fake revenue department',
    sourceCode: 'MOCK_INCOME_API',
    connector: new FakeIncomeConnector(),
    failing: new FakeIncomeConnector(CONNECTOR_BEHAVIOUR.ALWAYS_FAIL),
    supported: ['INCOME_RECORD'],
    foreign: 'EDUCATION_RECORD',
    referencePrefix: 'INC',
    issuer: 'Demo Revenue Department (Simulated)',
    fieldKey: 'incomeBand',
    providerAttribute: 'income_band',
  },
  {
    label: 'fake DigiLocker',
    sourceCode: 'DIGILOCKER_MOCK',
    connector: new FakeDigiLockerConnector(),
    failing: new FakeDigiLockerConnector(CONNECTOR_BEHAVIOUR.ALWAYS_FAIL),
    supported: ['BANK_DETAILS', 'COMMUNITY_RECORD'],
    foreign: 'INCOME_RECORD',
    referencePrefix: 'DL',
    issuer: 'Demo Public Bank (Simulated)',
    fieldKey: 'bankAccountMasked',
    providerAttribute: 'acct_no_masked',
  },
];

const retrieve = (connector: GovernmentDataConnector, requirementCode: string) =>
  connector.retrieve({ requirementCode, correlationId: CORRELATION_ID });

describe.each(cases)('$label', (testCase) => {
  const first = testCase.supported[0] as string;

  it('is registered against its own database source code', () => {
    expect(testCase.connector.sourceCode).toBe(testCase.sourceCode);
    expect(resolveConnector(testCase.sourceCode)).not.toBeNull();
  });

  it('serves every requirement the seeded catalogue routes to it', async () => {
    for (const requirementCode of testCase.supported) {
      await expect(retrieve(testCase.connector, requirementCode)).resolves.toBeDefined();
    }
  });

  it('returns a normalized result naming a simulated issuer', async () => {
    const result = await retrieve(testCase.connector, first);
    expect(result.issuer).toBe(testCase.issuer);
    expect(result.issuer).toContain('Simulated');
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('maps provider field names onto SetuX field keys', async () => {
    const result = await retrieve(testCase.connector, first);
    const keys = result.fields.map((field) => field.fieldKey);
    expect(keys).toContain(testCase.fieldKey);
    // The provider's own vocabulary must not survive normalization.
    expect(keys).not.toContain(testCase.providerAttribute);
  });

  it('gives every normalized field a human-readable label and a value', async () => {
    const result = await retrieve(testCase.connector, first);
    for (const field of result.fields) {
      expect(field.label.length).toBeGreaterThan(0);
      expect(field.value.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic — the same request yields the same result', async () => {
    expect(await retrieve(testCase.connector, first)).toEqual(
      await retrieve(testCase.connector, first),
    );
  });

  it('derives a provider-specific synthetic reference from the correlation id', async () => {
    const result = await retrieve(testCase.connector, first);
    expect(result.providerReference).toMatch(
      new RegExp(`^SYNTH-${testCase.referencePrefix}-[0-9A-F]{12}$`, 'u'),
    );
  });

  it('returns only synthetic values, never a real identifier format', async () => {
    const result = await retrieve(testCase.connector, first);
    const values = result.fields.map((field) => field.value).join(' ');
    // No bare 12-digit Aadhaar-shaped run, and no PAN-shaped token.
    expect(values).not.toMatch(/\b\d{12}\b/u);
    expect(values).not.toMatch(/\b[A-Z]{5}\d{4}[A-Z]\b/u);
  });

  it('refuses a requirement belonging to another source, without inventing a record', async () => {
    await expect(retrieve(testCase.connector, testCase.foreign)).rejects.toMatchObject({
      code: CONNECTOR_ERROR_CODES.UNSUPPORTED_REQUIREMENT,
      retryable: false,
    });
  });

  it('refuses an unknown requirement code', async () => {
    await expect(retrieve(testCase.connector, 'NOT_A_REQUIREMENT')).rejects.toBeInstanceOf(
      ConnectorError,
    );
  });

  it('simulates a provider outage as a retryable failure', async () => {
    await expect(retrieve(testCase.failing, first)).rejects.toMatchObject({
      code: CONNECTOR_ERROR_CODES.PROVIDER_UNAVAILABLE,
      retryable: true,
    });
  });

  it('reports failure in SetuX wording, never a provider payload or stack trace', async () => {
    await expect(retrieve(testCase.failing, first)).rejects.toMatchObject({
      message: expect.stringContaining('simulated'),
    });
  });

  it('makes no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await retrieve(testCase.connector, first);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('needs no credential or environment configuration', async () => {
    // A provider secret would have to be read from somewhere; nothing here is.
    const before = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (/DIGILOCKER|IDENTITY|EDUCATION|INCOME|PROVIDER/u.test(key)) delete process.env[key];
    }
    await expect(retrieve(testCase.connector, first)).resolves.toBeDefined();
    process.env = before;
  });

  it('declares itself simulated', () => {
    expect(testCase.connector.isSimulated).toBe(true);
  });
});

describe('connector registry — Phase 9 registration', () => {
  it('resolves every seeded government source to a connector', () => {
    for (const sourceCode of [
      'DIGILOCKER_MOCK',
      'MOCK_IDENTITY_API',
      'MOCK_EDUCATION_API',
      'MOCK_INCOME_API',
    ]) {
      expect(resolveConnector(sourceCode)).not.toBeNull();
    }
  });

  it('resolves each source to the connector that claims it, never another', () => {
    for (const testCase of cases) {
      expect(resolveConnector(testCase.sourceCode)?.sourceCode).toBe(testCase.sourceCode);
    }
  });

  it('returns null for a forged or unknown source code', () => {
    expect(resolveConnector('TOTALLY_MADE_UP')).toBeNull();
    expect(resolveConnector('')).toBeNull();
    expect(resolveConnector('digilocker_mock')).toBeNull();
  });
});

/**
 * Cross-source isolation at the connector layer.
 *
 * The retrieval service decides *whether* a connector runs; these assert that
 * even if one were reached for the wrong requirement, it could not answer for
 * another provider's data (Phase 9 §25, §36).
 */
describe('cross-source isolation', () => {
  it('no connector answers for a requirement another source owns', async () => {
    const ownership: Readonly<Record<string, string>> = {
      IDENTITY: 'MOCK_IDENTITY_API',
      EDUCATION_RECORD: 'MOCK_EDUCATION_API',
      INCOME_RECORD: 'MOCK_INCOME_API',
      BANK_DETAILS: 'DIGILOCKER_MOCK',
      COMMUNITY_RECORD: 'DIGILOCKER_MOCK',
    };

    for (const [requirementCode, owningSource] of Object.entries(ownership)) {
      for (const testCase of cases) {
        if (testCase.sourceCode === owningSource) continue;
        await expect(retrieve(testCase.connector, requirementCode)).rejects.toMatchObject({
          code: CONNECTOR_ERROR_CODES.UNSUPPORTED_REQUIREMENT,
        });
      }
    }
  });

  it('gives each provider a distinguishable reference prefix', async () => {
    const references = await Promise.all(
      cases.map(async (testCase) =>
        (await retrieve(testCase.connector, testCase.supported[0] as string)).providerReference,
      ),
    );
    expect(new Set(references).size).toBe(cases.length);
  });

  it('produces disjoint field keys across providers, so one cannot overwrite another', async () => {
    const seen = new Set<string>();
    for (const testCase of cases) {
      for (const requirementCode of testCase.supported) {
        const result = await retrieve(testCase.connector, requirementCode);
        for (const field of result.fields) {
          expect(seen.has(field.fieldKey)).toBe(false);
          seen.add(field.fieldKey);
        }
      }
    }
  });
});
