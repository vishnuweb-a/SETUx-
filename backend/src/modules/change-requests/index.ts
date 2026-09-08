/**
 * Change & Correction Service — the change draft (Phase 4).
 *
 * Creates and revises a citizen's DRAFT correction request. Reads the source
 * record to snapshot what it currently holds; writes only to `change_requests`
 * and `change_request_fields`. A citizen's government record is never modified
 * here (arch §13).
 */

export { changeRequestsRouter } from './change-request.routes.js';
export {
  createChangeDraft,
  getChangeDraft,
  updateChangeDraft,
} from './change-request.service.js';
export {
  CHANGE_REQUEST_STATUS,
  type ChangeRequestDetail,
  type ChangeRequestField,
  type ChangeRequestStatus,
  type FieldPolicySnapshot,
} from './change-request.types.js';
