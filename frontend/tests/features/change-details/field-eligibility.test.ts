import { describe, expect, it } from 'vitest';
import { fieldEligibility } from '@/features/change-details/utils/field-eligibility';
import {
  fieldLabel,
  formatFieldValue,
  recordTypeLabel,
  selectableFields,
  sourceLabel,
  authorityLabel,
} from '@/features/change-details/utils/record-presentation';
import type {
  CitizenRecordField,
  FieldEditability,
  RecordType,
} from '@/features/change-details/types/change-details.types';

const field = (overrides: Partial<CitizenRecordField> = {}): CitizenRecordField => ({
  fieldKey: 'identityHolderName',
  value: 'Demo Old Name',
  retrievedAt: '2026-09-08T00:00:00.000Z',
  editability: 'EDITABLE',
  changeable: true,
  requiresEvidence: false,
  requiresReview: false,
  policyAuthority: 'Identity Authority',
  ...overrides,
});

describe('field eligibility', () => {
  it('presents an editable field as selectable, with plain guidance', () => {
    const presentation = fieldEligibility(field());

    expect(presentation.isSelectable).toBe(true);
    expect(presentation.badgeLabel).toBe('Editable');
    expect(presentation.helperText).toBe('You can request a change to this field.');
  });

  it('presents a conditionally editable field as selectable', () => {
    const presentation = fieldEligibility(
      field({ editability: 'CONDITIONALLY_EDITABLE', requiresEvidence: true }),
    );

    expect(presentation.isSelectable).toBe(true);
    expect(presentation.badgeLabel).toBe('Conditionally editable');
  });

  it('names evidence, review, and both, from the policy alone', () => {
    const evidenceOnly = fieldEligibility(
      field({ editability: 'CONDITIONALLY_EDITABLE', requiresEvidence: true }),
    );
    const reviewOnly = fieldEligibility(
      field({ editability: 'CONDITIONALLY_EDITABLE', requiresReview: true }),
    );
    const both = fieldEligibility(
      field({
        editability: 'CONDITIONALLY_EDITABLE',
        requiresEvidence: true,
        requiresReview: true,
      }),
    );

    expect(evidenceOnly.helperText).toBe('This change requires supporting evidence.');
    expect(reviewOnly.helperText).toBe('This change requires department review.');
    expect(both.helperText).toBe(
      'This change requires supporting evidence and department review.',
    );
  });

  it('states a condition it can be sure of when the policy records neither requirement', () => {
    const presentation = fieldEligibility(field({ editability: 'CONDITIONALLY_EDITABLE' }));

    expect(presentation.isSelectable).toBe(true);
    expect(presentation.helperText).toContain('additional checks');
  });

  it('locks an immutable field and names the authority that owns it', () => {
    const presentation = fieldEligibility(
      field({ editability: 'IMMUTABLE', changeable: false, policyAuthority: 'Revenue Department' }),
    );

    expect(presentation.isSelectable).toBe(false);
    expect(presentation.badgeLabel).toBe('Locked');
    expect(presentation.helperText).toContain('cannot be changed through SetuX');
    expect(presentation.helperText).toContain('Revenue Department');
  });

  it('still explains an immutable field with no recorded authority', () => {
    const presentation = fieldEligibility(
      field({ editability: 'IMMUTABLE', changeable: false, policyAuthority: null }),
    );

    expect(presentation.isSelectable).toBe(false);
    expect(presentation.helperText).toBe('This field cannot be changed through SetuX.');
  });

  it('refuses a field with no policy rather than defaulting it open', () => {
    const presentation = fieldEligibility(
      field({ editability: null, changeable: false, policyAuthority: null }),
    );

    expect(presentation.isSelectable).toBe(false);
    expect(presentation.helperText).toContain('no correction policy');
  });

  it('refuses an editability the client does not recognise', () => {
    const presentation = fieldEligibility(
      field({ editability: 'SOMETHING_NEW' as FieldEditability, changeable: true }),
    );

    expect(presentation.isSelectable).toBe(false);
  });

  it('never lets a changeable flag overrule IMMUTABLE', () => {
    // The server derives the two consistently. Were they ever to disagree, the
    // restrictive half must win.
    const presentation = fieldEligibility(field({ editability: 'IMMUTABLE', changeable: true }));

    expect(presentation.isSelectable).toBe(false);
  });

  it('does not infer editability from the field key', () => {
    // A certificate number that policy calls EDITABLE is editable. Nothing in
    // the frontend gets to decide it "looks immutable".
    const presentation = fieldEligibility(
      field({ fieldKey: 'incomeCertificateNumber', editability: 'EDITABLE', changeable: true }),
    );

    expect(presentation.isSelectable).toBe(true);
  });
});

describe('record presentation', () => {
  it('labels every record type', () => {
    const types: readonly RecordType[] = [
      'IDENTITY_RECORD',
      'INCOME_RECORD',
      'EDUCATION_RECORD',
      'COMMUNITY_RECORD',
      'BANK_DETAILS',
    ];

    expect(types.map(recordTypeLabel)).toEqual([
      'Identity Record',
      'Income Certificate',
      'Education Record',
      'Community Certificate',
      'Bank Details',
    ]);
  });

  it('maps the normalised field keys to human labels', () => {
    expect(fieldLabel('identityHolderName')).toBe('Full Name');
    expect(fieldLabel('educationEnrolmentNumber')).toBe('Enrollment Number');
    expect(fieldLabel('bankAccountMasked')).toBe('Account Number');
  });

  it('falls back to the key rather than hiding an unmapped field', () => {
    expect(fieldLabel('identitySomethingNew')).toBe('identitySomethingNew');
  });

  it('renders values of whatever type the source supplied', () => {
    expect(formatFieldValue('Demo Old Name')).toBe('Demo Old Name');
    expect(formatFieldValue(72.5)).toBe('72.5');
    expect(formatFieldValue(null)).toBe('—');
    expect(formatFieldValue('')).toBe('—');
    expect(formatFieldValue(undefined)).toBe('—');
  });

  it('marks a simulated source as simulated', () => {
    const bank = { code: 'MOCK_BANK_API', name: 'Demo Public Bank' };

    expect(sourceLabel(bank, true)).toBe('Demo Public Bank (Simulated)');
    expect(sourceLabel(bank, false)).toBe('Demo Public Bank');
  });

  it('does not repeat a marker the source name already carries', () => {
    // Every seeded source names itself "(Mock)" or "(Simulated)". Appending
    // unconditionally produced "Demo Public Bank (Simulated) (Simulated)".
    expect(sourceLabel({ code: 'MOCK_BANK_API', name: 'Demo Public Bank (Simulated)' }, true)).toBe(
      'Demo Public Bank (Simulated)',
    );
    expect(sourceLabel({ code: 'DIGILOCKER_MOCK', name: 'DigiLocker (Mock)' }, true)).toBe(
      'DigiLocker (Mock)',
    );
    expect(
      sourceLabel({ code: 'MOCK_IDENTITY_API', name: 'Identity Registry (Mock)' }, true),
    ).toBe('Identity Registry (Mock)');
  });

  it('says who handles a record with no authority department, rather than inventing one', () => {
    expect(authorityLabel(null)).toBe('Handled directly by the provider');
    expect(authorityLabel({ code: 'IDENTITY_AUTHORITY', name: 'Identity Authority' })).toBe(
      'Identity Authority',
    );
  });

  it('counts only the fields the server marked changeable', () => {
    const fields = [
      field({ fieldKey: 'a', changeable: true }),
      field({ fieldKey: 'b', editability: 'IMMUTABLE', changeable: false }),
      field({ fieldKey: 'c', editability: null, changeable: false }),
    ];

    expect(selectableFields(fields).map((entry) => entry.fieldKey)).toEqual(['a']);
  });
});
