import { describe, expect, it, vi } from 'vitest';
import {
  CONNECTOR_ERROR_CODES,
  ConnectorError,
  FAKE_DIGILOCKER_BEHAVIOUR,
  FakeDigiLockerConnector,
  resolveConnector,
} from '../../src/connectors/index.js';

const CORRELATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const connector = new FakeDigiLockerConnector();
const retrieve = (requirementCode: string, instance = connector) =>
  instance.retrieve({ requirementCode, correlationId: CORRELATION_ID });

describe('fake DigiLocker connector', () => {
  it('returns a normalized result for a supported requirement', async () => {
    const result = await retrieve('BANK_DETAILS');
    expect(result).toMatchObject({
      documentType: 'BANK_ACCOUNT_PROOF',
      issuer: 'Demo Public Bank (Simulated)',
      issuedOn: '2026-01-15',
    });
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('maps provider field names onto SetuX field keys', async () => {
    const result = await retrieve('BANK_DETAILS');
    const keys = result.fields.map((field) => field.fieldKey);
    // The provider's own vocabulary must not survive normalization.
    expect(keys).toContain('bankAccountMasked');
    expect(keys).not.toContain('acct_no_masked');
  });

  it('gives every normalized field a human-readable label', async () => {
    const result = await retrieve('COMMUNITY_RECORD');
    for (const field of result.fields) {
      expect(field.label.length).toBeGreaterThan(0);
      expect(field.value.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic — the same request yields the same result', async () => {
    expect(await retrieve('BANK_DETAILS')).toEqual(await retrieve('BANK_DETAILS'));
  });

  it('derives the synthetic provider reference from the correlation id', async () => {
    const result = await retrieve('BANK_DETAILS');
    expect(result.providerReference).toMatch(/^SYNTH-DL-[0-9A-F]{12}$/u);
  });

  it('returns only synthetic values, never a real document number format', async () => {
    const result = await retrieve('COMMUNITY_RECORD');
    const values = result.fields.map((field) => field.value).join(' ');
    // No bare 12-digit Aadhaar-shaped run, and no PAN-shaped token.
    expect(values).not.toMatch(/\b\d{12}\b/u);
    expect(values).not.toMatch(/\b[A-Z]{5}\d{4}[A-Z]\b/u);
  });

  it('supports both requirements the seeded catalogue routes to DigiLocker', async () => {
    await expect(retrieve('BANK_DETAILS')).resolves.toBeDefined();
    await expect(retrieve('COMMUNITY_RECORD')).resolves.toBeDefined();
  });

  it('refuses a requirement it does not serve, without inventing a document', async () => {
    await expect(retrieve('INCOME_RECORD')).rejects.toMatchObject({
      code: CONNECTOR_ERROR_CODES.UNSUPPORTED_REQUIREMENT,
      retryable: false,
    });
  });

  it('simulates a provider outage as a retryable failure', async () => {
    const failing = new FakeDigiLockerConnector(FAKE_DIGILOCKER_BEHAVIOUR.ALWAYS_FAIL);
    await expect(retrieve('BANK_DETAILS', failing)).rejects.toMatchObject({
      code: CONNECTOR_ERROR_CODES.PROVIDER_UNAVAILABLE,
      retryable: true,
    });
  });

  it('raises ConnectorError, so provider internals never reach the transport layer', async () => {
    await expect(retrieve('NOT_A_REQUIREMENT')).rejects.toBeInstanceOf(ConnectorError);
  });

  it('makes no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await retrieve('BANK_DETAILS');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('needs no credential or environment configuration', async () => {
    // A provider secret would have to be read from somewhere; nothing here is.
    const before = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.includes('DIGILOCKER')) delete process.env[key];
    }
    await expect(retrieve('BANK_DETAILS')).resolves.toBeDefined();
    process.env = before;
  });

  it('declares itself simulated', () => {
    expect(connector.isSimulated).toBe(true);
  });
});

describe('connector registry', () => {
  it('resolves the DigiLocker mock by its database source code', () => {
    expect(resolveConnector('DIGILOCKER_MOCK')).not.toBeNull();
  });

  it('returns null for an unknown source code, so a forged one resolves to nothing', () => {
    expect(resolveConnector('TOTALLY_MADE_UP')).toBeNull();
  });
});
