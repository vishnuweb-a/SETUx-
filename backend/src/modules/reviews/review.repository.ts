import { getDatabaseClient, toAppError } from '../../database/index.js';
import type { ApplicationStatus } from '../applications/application.types.js';
import type { ReviewDecision, ReviewRow } from './review.types.js';

/**
 * The officer's own scope, resolved from stored rows.
 *
 * Every query in this module is scoped through this. The backend runs on the
 * service-role key and therefore bypasses RLS, so nothing filters these rows
 * for us — an unscoped query here would hand one department's applications to
 * another department's officer, and the database would not object
 * (supabase-client.ts).
 *
 * The scope is derived exactly as `private.officer_can_read_application` derives
 * it in RLS: the officer's department name, matched against `services.department`
 * (database-design.md §5.4). Deliberately the same join, so the backend and the
 * database agree on who may see what rather than each having its own opinion.
 */
export interface OfficerScope {
  readonly departmentId: string;
  readonly departmentName: string;
  readonly officerName: string;
  /** Services this officer's department handles. Empty means an empty queue. */
  readonly serviceIds: readonly string[];
}

export const findOfficerScope = async (userId: string): Promise<OfficerScope | null> => {
  const client = getDatabaseClient();

  const { data: profile, error: profileError } = await client
    .from('government_profiles')
    .select('department_id, full_name, departments ( name )')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError) throw toAppError(profileError, 'government_profiles.findScope', 'Officer profile');
  if (!profile) return null;

  const department = Array.isArray(profile.departments)
    ? profile.departments[0]
    : profile.departments;
  if (!department) return null;

  const { data: services, error: servicesError } = await client
    .from('services')
    .select('id')
    .eq('department', department.name);
  if (servicesError) throw toAppError(servicesError, 'services.listForDepartment', 'Service');

  return {
    departmentId: profile.department_id,
    departmentName: department.name,
    officerName: profile.full_name,
    serviceIds: (services ?? []).map((service) => service.id),
  };
};

export interface QueueApplicationRow {
  readonly id: string;
  readonly application_number: string;
  readonly citizen_id: string;
  readonly status: ApplicationStatus;
  readonly submitted_at: string | null;
  readonly updated_at: string;
  readonly service_name: string;
  readonly citizen_name: string;
}

/**
 * The applications in this officer's scope, newest activity first.
 *
 * `DRAFT` is excluded unconditionally, not merely by the status filter: a draft
 * is private to the citizen until they submit it, and an officer must not see
 * one even when listing "everything". This mirrors the same exclusion in the
 * RLS policy.
 */
export const listApplicationsForOfficer = async (params: {
  readonly scope: OfficerScope;
  readonly status?: ApplicationStatus;
  readonly page: number;
  readonly limit: number;
}): Promise<{ readonly rows: readonly QueueApplicationRow[]; readonly total: number }> => {
  if (params.scope.serviceIds.length === 0) return { rows: [], total: 0 };

  const client = getDatabaseClient();
  const from = (params.page - 1) * params.limit;

  let builder = client
    .from('applications')
    .select('id, application_number, citizen_id, status, submitted_at, updated_at, services ( name )', {
      count: 'exact',
    })
    .in('service_id', params.scope.serviceIds)
    .neq('status', 'DRAFT');

  if (params.status) builder = builder.eq('status', params.status);

  const { data, error, count } = await builder
    .order('updated_at', { ascending: false })
    .range(from, from + params.limit - 1);
  if (error) throw toAppError(error, 'applications.listForOfficer', 'Application');

  // Applicant names in one query for the whole page, rather than a nested
  // select per row: `citizen_profiles` hangs off `profiles`, one hop further
  // than `applications` reaches, and a per-row lookup would be N+1.
  const citizenIds = [...new Set((data ?? []).map((row) => row.citizen_id))];
  const namesByCitizenId = new Map<string, string>();

  if (citizenIds.length > 0) {
    const { data: profiles, error: profilesError } = await client
      .from('citizen_profiles')
      .select('user_id, full_name')
      .in('user_id', citizenIds);
    if (profilesError) throw toAppError(profilesError, 'citizen_profiles.listForQueue', 'Citizen profile');
    for (const profile of profiles ?? []) namesByCitizenId.set(profile.user_id, profile.full_name);
  }

  const rows = (data ?? []).map((row) => {
    const service = Array.isArray(row.services) ? row.services[0] : row.services;

    return {
      id: row.id,
      application_number: row.application_number,
      citizen_id: row.citizen_id,
      status: row.status,
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      service_name: service?.name ?? 'Unknown service',
      // A citizen who somehow has no onboarding row is named by neither a
      // placeholder identity nor their email — the officer is told the name is
      // unavailable rather than being shown something invented.
      citizen_name: namesByCitizenId.get(row.citizen_id) ?? 'Name unavailable',
    };
  });

  return { rows, total: count ?? 0 };
};

/**
 * One application, scoped to the officer's services.
 *
 * Scoping on `service_id` rather than checking afterwards is what makes an
 * out-of-scope application read as ABSENT rather than forbidden — the same
 * concealment the citizen-facing modules use, and for the same reason: a 403
 * here would confirm that an application with this identifier exists
 * (§20).
 */
export const findApplicationForOfficer = async (params: {
  readonly applicationId: string;
  readonly scope: OfficerScope;
}): Promise<
  (QueueApplicationRow & { readonly service_id: string; readonly service_code: string }) | null
> => {
  if (params.scope.serviceIds.length === 0) return null;

  const { data, error } = await getDatabaseClient()
    .from('applications')
    .select(
      'id, application_number, citizen_id, service_id, status, submitted_at, updated_at, services ( code, name )',
    )
    .eq('id', params.applicationId)
    .in('service_id', params.scope.serviceIds)
    .neq('status', 'DRAFT')
    .maybeSingle();
  if (error) throw toAppError(error, 'applications.findForOfficer', 'Application');
  if (!data) return null;

  const service = Array.isArray(data.services) ? data.services[0] : data.services;

  return {
    id: data.id,
    service_code: service?.code ?? '',
    application_number: data.application_number,
    citizen_id: data.citizen_id,
    service_id: data.service_id,
    status: data.status,
    submitted_at: data.submitted_at,
    updated_at: data.updated_at,
    service_name: service?.name ?? 'Unknown service',
    citizen_name: '',
  };
};

/** Verification outcomes for a set of applications, for the queue summary. */
export const listVerificationsForApplications = async (
  applicationIds: readonly string[],
): Promise<readonly { application_id: string; status: string }[]> => {
  if (applicationIds.length === 0) return [];

  const { data, error } = await getDatabaseClient()
    .from('verifications')
    .select('application_id, status')
    .in('application_id', [...applicationIds]);
  if (error) throw toAppError(error, 'verifications.listForQueue', 'Verification');
  return data ?? [];
};

export interface OfficerVerificationRow {
  readonly verification_type: string;
  readonly status: string;
  readonly result: unknown;
  readonly verified_at: string | null;
}

export const listVerificationDetail = async (
  applicationId: string,
): Promise<readonly OfficerVerificationRow[]> => {
  const { data, error } = await getDatabaseClient()
    .from('verifications')
    .select('verification_type, status, result, verified_at')
    .eq('application_id', applicationId);
  if (error) throw toAppError(error, 'verifications.listForReview', 'Verification');
  return data ?? [];
};

export interface OfficerEvidenceRow {
  readonly field_code: string;
  readonly field_value: unknown;
  readonly source_type: string | null;
  readonly verification_status: string;
  readonly verified_at: string | null;
  readonly source_name: string | null;
}

/**
 * The stored evidence for one application, with its provenance.
 *
 * Returns SetuX's normalized values from `application_data`, never a provider's
 * raw payload — that is not stored anywhere the officer can reach, by design
 * (Phase 8 §24). The source NAME is joined in because "Education Department
 * (Mock)" is what makes the federation visible in the demo; the source id would
 * mean nothing on screen.
 */
export const listEvidenceForReview = async (
  applicationId: string,
): Promise<readonly OfficerEvidenceRow[]> => {
  const { data, error } = await getDatabaseClient()
    .from('application_data')
    .select('field_code, field_value, source_type, verification_status, verified_at, data_sources ( name )')
    .eq('application_id', applicationId)
    .order('field_code');
  if (error) throw toAppError(error, 'application_data.listForReview', 'Application data');

  return (data ?? []).map((row) => {
    const source = Array.isArray(row.data_sources) ? row.data_sources[0] : row.data_sources;
    return {
      field_code: row.field_code,
      field_value: row.field_value,
      source_type: row.source_type,
      verification_status: row.verification_status,
      verified_at: row.verified_at,
      source_name: source?.name ?? null,
    };
  });
};

/** The applicant's onboarding record, for the officer's applicant panel. */
export const findApplicantForReview = async (citizenId: string) => {
  const { data, error } = await getDatabaseClient()
    .from('citizen_profiles')
    .select('full_name, government_id, mobile_number, date_of_birth')
    .eq('user_id', citizenId)
    .maybeSingle();
  if (error) throw toAppError(error, 'citizen_profiles.findForReview', 'Citizen profile');
  return data;
};

/** The service requirements, for the wording of each verification row. */
export const listRequirementLabels = async (
  serviceId: string,
): Promise<ReadonlyMap<string, { readonly name: string; readonly required: boolean }>> => {
  const { data, error } = await getDatabaseClient()
    .from('service_requirements')
    .select('requirement_code, name, required, display_order')
    .eq('service_id', serviceId)
    .order('display_order');
  if (error) throw toAppError(error, 'service_requirements.listForReview', 'Requirement');

  return new Map(
    (data ?? []).map((row) => [row.requirement_code, { name: row.name, required: row.required }]),
  );
};

/** The decision already recorded on an application, with its reviewer's name. */
export const findReviewForApplication = async (
  applicationId: string,
): Promise<(ReviewRow & { readonly reviewer_name: string | null }) | null> => {
  const client = getDatabaseClient();

  const { data, error } = await client
    .from('application_reviews')
    .select('id, application_id, reviewer_id, department_id, decision, remarks, reviewed_at')
    .eq('application_id', applicationId)
    .in('decision', ['APPROVED', 'REJECTED'])
    .maybeSingle();
  if (error) throw toAppError(error, 'application_reviews.findForApplication', 'Review');
  if (!data) return null;

  // A second lookup rather than a nested select: `reviewer_id` references
  // `profiles`, and the officer's NAME lives on `government_profiles`, which is
  // one further hop. PostgREST cannot traverse that implicitly, so the join is
  // made explicit here instead of being expressed as a relationship that does
  // not exist.
  const { data: reviewer, error: reviewerError } = await client
    .from('government_profiles')
    .select('full_name')
    .eq('user_id', data.reviewer_id)
    .maybeSingle();
  if (reviewerError) throw toAppError(reviewerError, 'government_profiles.findReviewer', 'Officer profile');

  return {
    id: data.id,
    application_id: data.application_id,
    reviewer_id: data.reviewer_id,
    department_id: data.department_id,
    decision: data.decision,
    remarks: data.remarks,
    reviewed_at: data.reviewed_at,
    reviewer_name: reviewer?.full_name ?? null,
  };
};

/** Counts of each status in the officer's scope, for the dashboard. */
export const countApplicationsByStatus = async (
  scope: OfficerScope,
): Promise<Readonly<Record<string, number>>> => {
  if (scope.serviceIds.length === 0) return {};

  const { data, error } = await getDatabaseClient()
    .from('applications')
    .select('status')
    .in('service_id', scope.serviceIds)
    .neq('status', 'DRAFT');
  if (error) throw toAppError(error, 'applications.countForOfficer', 'Application');

  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
};

/**
 * Commits one officer decision: the review row, the final application status
 * and the timeline event, in one transaction.
 *
 * Returns an empty array when the database function's own guards did not pass —
 * the application is no longer in VERIFICATION because someone decided it
 * first, or this reviewer's department does not handle its service. The service
 * maps that to the right error; the function deliberately does not say which
 * guard failed.
 *
 * `reviewerId` is the authenticated user's id, passed from the service. It is
 * never taken from a request body, and the function re-derives the officer's
 * entitlement from it rather than trusting it as permission.
 */
export const recordDecision = async (params: {
  readonly applicationId: string;
  readonly reviewerId: string;
  readonly decision: ReviewDecision;
  readonly remarks: string | null;
}): Promise<readonly ReviewRow[]> => {
  const { data, error } = await getDatabaseClient().rpc('record_application_decision', {
    p_application_id: params.applicationId,
    p_reviewer_id: params.reviewerId,
    p_decision: params.decision,
    p_remarks: params.remarks,
  });
  if (error) throw toAppError(error, 'application_reviews.recordDecision', 'Review');
  return data ?? [];
};
