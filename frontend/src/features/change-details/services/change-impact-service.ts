import { apiRequest } from '@/services/api-client';
import type { ChangeImpactAnalysis } from '../types/change-impact.types';

/**
 * The impact detection API (Phase 5).
 *
 * ONE CALL, AND IT IS A GET. That is the whole surface of this file, and the
 * absence of everything else is the point:
 *
 *   - No POST, PATCH, PUT or DELETE. There is no target to create, no consent
 *     to grant and no status to move — all of those are the next phase's work,
 *     and a mutation here would have nothing on the server to call.
 *   - No request body. A caller cannot name a source record type, a field, a
 *     target, an impact level or a reason, because there is no parameter that
 *     carries one. Every value in the response is server-derived.
 *   - No citizen identifier. Ownership is a predicate applied server-side from
 *     the bearer token, and a draft belonging to someone else answers 404
 *     rather than 403.
 *
 * The impact is addressed as a sub-resource of the draft it describes, which is
 * what it is: a computed property of that draft, not a resource of its own.
 */
export const fetchChangeImpact = (
  changeRequestId: string,
  signal?: AbortSignal,
): Promise<ChangeImpactAnalysis> =>
  apiRequest(`/change-requests/drafts/${encodeURIComponent(changeRequestId)}/impact`, {
    signal,
  });
