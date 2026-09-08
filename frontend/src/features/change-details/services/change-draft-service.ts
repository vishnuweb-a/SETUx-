import { apiRequest } from '@/services/api-client';
import type {
  ChangeDraftDetail,
  CreateChangeDraftInput,
  UpdateChangeDraftInput,
} from '../types/change-draft.types';

/**
 * The change draft API (docs/FEATURES/change-draft-editable-form.md §5).
 *
 * Three calls, and their targets matter as much as their shapes: every one of
 * them addresses `/change-requests`. Nothing in this file writes to
 * `/citizen-records` — that resource has no write verb, and a mutation here
 * would have nothing on the server to call. The citizen's government record is
 * not modified by anything this feature does.
 *
 * No request carries a citizen identifier. Ownership is a predicate applied
 * server-side from the bearer token, and a draft belonging to someone else
 * answers 404 rather than 403.
 */

/**
 * Creates a draft from the record and the values the citizen entered.
 *
 * The body carries only `fieldKey` and `proposedValue` per field. The old value
 * is deliberately not sent: the server reads it from the database, so what ends
 * up stored as "what the source said" cannot be influenced from here (arch
 * §4.5). Sending it would also be rejected — the request schema is strict.
 */
export const createChangeDraft = (
  input: CreateChangeDraftInput,
  signal?: AbortSignal,
): Promise<ChangeDraftDetail> =>
  apiRequest('/change-requests/drafts', {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  });

/**
 * Reads one draft back.
 *
 * This is what makes a refresh safe: the values come from the server, not from
 * navigation state, so reloading the edit screen restores the citizen's work
 * rather than losing it.
 */
export const fetchChangeDraft = (
  changeRequestId: string,
  signal?: AbortSignal,
): Promise<ChangeDraftDetail> =>
  apiRequest(`/change-requests/drafts/${encodeURIComponent(changeRequestId)}`, { signal });

/**
 * Revises the proposed values of an existing draft.
 *
 * The body replaces the field set. It still carries no old value, so a revision
 * changes what the citizen is asking for and never what the source said when
 * they asked.
 */
export const updateChangeDraft = (
  changeRequestId: string,
  input: UpdateChangeDraftInput,
  signal?: AbortSignal,
): Promise<ChangeDraftDetail> =>
  apiRequest(`/change-requests/drafts/${encodeURIComponent(changeRequestId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    signal,
  });
