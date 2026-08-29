-- =============================================================================
-- SetuX — Phase 2 — Controlled value domains
-- =============================================================================
-- Source: docs/DATABASE/database-schema.md §8, §19, §28, §34, §36
--         docs/lld/database-design.md §5.7, §5.9, §5.11, §5.13
--
-- Enums are used only for states the backend owns and that are stable for the
-- MVP. Values expected to change with configuration (service codes, event
-- types, requirement codes) stay TEXT and live in reference tables instead.
-- =============================================================================

-- profiles.role — docs/PHASES/phase.md Phase 3 defines exactly two roles.
create type public.user_role as enum (
  'CITIZEN',
  'GOVERNMENT_OFFICER'
);

-- profiles.onboarding_status — server-controlled (database-schema.md §10).
create type public.onboarding_status as enum (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED'
);

-- applications.status — database-schema.md §19.
create type public.application_status as enum (
  'DRAFT',
  'CONSENT_PENDING',
  'DATA_RETRIEVAL',
  'VERIFICATION',
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
  'UNDER_REVIEW',
  'REQUESTED_INFO',
  'WAITING_FOR_DEPARTMENT',
  'RETRYING',
  'FAILED',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

-- consents.status — database-schema.md §28 unions database-design.md §5.11.
create type public.consent_status as enum (
  'PENDING',
  'GRANTED',
  'DENIED',
  'REVOKED',
  'EXPIRED'
);

-- verifications.status — database-schema.md §34.
create type public.verification_status as enum (
  'PENDING',
  'PROCESSING',
  'VERIFIED',
  'FAILED',
  'REQUIRES_ACTION'
);

-- application_data.verification_status — database-design.md §5.9.
create type public.data_verification_status as enum (
  'PENDING',
  'VERIFIED',
  'FAILED',
  'NOT_AVAILABLE'
);

-- data_retrievals.status — database-schema.md §26 unions database-design.md §5.14.
create type public.retrieval_status as enum (
  'PENDING',
  'IN_PROGRESS',
  'SUCCESS',
  'FAILED',
  'TIMEOUT',
  'RETRYING'
);

-- data_sources.type — database-design.md §5.13.
create type public.data_source_type as enum (
  'DIGILOCKER',
  'GOVERNMENT_API',
  'LEGACY_SYSTEM',
  'MOCK_API'
);

-- application_reviews.decision — database-schema.md §36.
create type public.review_decision as enum (
  'APPROVED',
  'REJECTED',
  'REQUESTED_INFO'
);
