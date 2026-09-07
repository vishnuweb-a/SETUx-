import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The editable field policy decision, with only the repository stubbed
 * (Change & Correction Service, Phase 1).
 *
 * These tests are about ONE property, stated three ways: the decision comes
 * from the policy row and from nothing else. There is no input to these
 * functions through which a caller could influence the answer — no session, no
 * request, no proposed value — and that absence is what makes the frontend
 * structurally unable to forge editability.
 */

vi.mock('../../src/modules/field-policies/field-policy.repository.js', () => ({
  listActiveFieldPolicies: vi.fn(),
  findActiveFieldPolicy: vi.fn(),
}));

const repository = await import(
  '../../src/modules/field-policies/field-policy.repository.js'
);
const {
  assertFieldEditable,
  getFieldPolicy,
  getRecordTypeFieldPolicies,
  resolveFieldChangeDecision,
} = await import('../../src/modules/field-policies/field-policy.service.js');
const { ERROR_CODES } = await import('../../src/shared/errors/index.js');

const repo = {
  listActiveFieldPolicies: vi.mocked(repository.listActiveFieldPolicies),
  findActiveFieldPolicy: vi.mocked(repository.findActiveFieldPolicy),
};

/** An EDITABLE field: correctable, demanding nothing further. */
const MOBILE = {
  fieldKey: 'identityMobile',
  editability: 'EDITABLE',
  requiresEvidence: false,
  requiresReview: false,
  authority: 'Identity Authority',
  dependencyGroup: 'CONTACT',
} as const;

/** A CONDITIONALLY_EDITABLE field: correctable, with requirements attached. */
const HOLDER_NAME = {
  fieldKey: 'identityHolderName',
  editability: 'CONDITIONALLY_EDITABLE',
  requiresEvidence: true,
  requiresReview: true,
  authority: 'Identity Authority',
  dependencyGroup: 'LEGAL_NAME',
} as const;

/** An IMMUTABLE field: no correction may be requested at all. */
const REGISTRY_REFERENCE = {
  fieldKey: 'identityRegistryReference',
  editability: 'IMMUTABLE',
  requiresEvidence: false,
  requiresReview: false,
  authority: 'Identity Authority',
  dependencyGroup: null,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRecordTypeFieldPolicies', () => {
  it('returns the record type alongside its active policies', async () => {
    repo.listActiveFieldPolicies.mockResolvedValue([MOBILE, REGISTRY_REFERENCE]);

    await expect(getRecordTypeFieldPolicies('IDENTITY_RECORD')).resolves.toEqual({
      recordType: 'IDENTITY_RECORD',
      fields: [MOBILE, REGISTRY_REFERENCE],
    });
    expect(repo.listActiveFieldPolicies).toHaveBeenCalledWith('IDENTITY_RECORD');
  });

  it('reports a record type whose policies are all retired as having no fields', async () => {
    // Not an error: a record type with every policy withdrawn is a
    // configuration state, and describing it honestly is the right answer.
    repo.listActiveFieldPolicies.mockResolvedValue([]);

    await expect(getRecordTypeFieldPolicies('BANK_DETAILS')).resolves.toEqual({
      recordType: 'BANK_DETAILS',
      fields: [],
    });
  });
});

describe('getFieldPolicy', () => {
  it('returns the active policy for a governed field', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(HOLDER_NAME);

    await expect(
      getFieldPolicy('IDENTITY_RECORD', 'identityHolderName'),
    ).resolves.toEqual(HOLDER_NAME);
  });

  it('refuses a field no policy governs', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(null);

    await expect(
      getFieldPolicy('IDENTITY_RECORD', 'identityUnknownField'),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.FIELD_POLICY_NOT_FOUND,
    });
  });

  it('refuses a field whose policy has been retired', async () => {
    // The repository selects only active rows, so a retired policy reaches the
    // service as `null` — indistinguishable from "never existed", which is
    // correct: both mean SetuX has no authority to accept this correction.
    repo.findActiveFieldPolicy.mockResolvedValue(null);

    await expect(
      getFieldPolicy('INCOME_RECORD', 'incomeAddress'),
    ).rejects.toMatchObject({ code: ERROR_CODES.FIELD_POLICY_NOT_FOUND });
  });
});

describe('assertFieldEditable', () => {
  it('permits an EDITABLE field and demands nothing further', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(MOBILE);

    await expect(
      assertFieldEditable('IDENTITY_RECORD', 'identityMobile'),
    ).resolves.toEqual({
      recordType: 'IDENTITY_RECORD',
      fieldKey: 'identityMobile',
      editability: 'EDITABLE',
      changeable: true,
      requiresEvidence: false,
      requiresReview: false,
      authority: 'Identity Authority',
    });
  });

  it('permits a CONDITIONALLY_EDITABLE field and returns its requirements', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(HOLDER_NAME);

    // The requirements are RETURNED, not enforced: there is no submission in
    // this phase to enforce them against. The phase that owns submission is the
    // one that must refuse an evidence-less request.
    await expect(
      assertFieldEditable('IDENTITY_RECORD', 'identityHolderName'),
    ).resolves.toEqual({
      recordType: 'IDENTITY_RECORD',
      fieldKey: 'identityHolderName',
      editability: 'CONDITIONALLY_EDITABLE',
      changeable: true,
      requiresEvidence: true,
      requiresReview: true,
      authority: 'Identity Authority',
    });
  });

  it('rejects an IMMUTABLE field, naming the authority that owns it', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(REGISTRY_REFERENCE);

    await expect(
      assertFieldEditable('IDENTITY_RECORD', 'identityRegistryReference'),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.FIELD_NOT_EDITABLE,
      details: { authority: 'Identity Authority' },
    });
  });

  it('rejects a field no policy governs rather than defaulting it to editable', async () => {
    // The central safety property of the whole table: an ungoverned field must
    // never become correctable by having been forgotten in the seed.
    repo.findActiveFieldPolicy.mockResolvedValue(null);

    await expect(
      assertFieldEditable('EDUCATION_RECORD', 'educationSecretField'),
    ).rejects.toMatchObject({ code: ERROR_CODES.FIELD_POLICY_NOT_FOUND });
  });

  it('asks the repository for exactly the record type and field it was given', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(MOBILE);

    await assertFieldEditable('IDENTITY_RECORD', 'identityMobile');

    expect(repo.findActiveFieldPolicy).toHaveBeenCalledWith(
      'IDENTITY_RECORD',
      'identityMobile',
    );
  });
});

describe('resolveFieldChangeDecision', () => {
  it('describes an IMMUTABLE field instead of throwing', async () => {
    // The non-throwing form exists for callers that must describe several
    // fields at once; raising on the first immutable one would make an impact
    // preview impossible to render.
    repo.findActiveFieldPolicy.mockResolvedValue(REGISTRY_REFERENCE);

    await expect(
      resolveFieldChangeDecision('IDENTITY_RECORD', 'identityRegistryReference'),
    ).resolves.toMatchObject({ editability: 'IMMUTABLE', changeable: false });
  });

  it('describes a CONDITIONALLY_EDITABLE field as changeable', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(HOLDER_NAME);

    await expect(
      resolveFieldChangeDecision('IDENTITY_RECORD', 'identityHolderName'),
    ).resolves.toMatchObject({ changeable: true, requiresEvidence: true });
  });

  it('returns null for an ungoverned field, so no caller can present it as changeable', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(null);

    await expect(
      resolveFieldChangeDecision('COMMUNITY_RECORD', 'communityMadeUpField'),
    ).resolves.toBeNull();
  });
});
