import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import {
  getFieldPolicy,
  getRecordTypeFieldPolicies,
} from './field-policy.service.js';
import type {
  FieldPolicyParams,
  RecordTypeParams,
} from './field-policy.schema.js';

/**
 * HTTP layer for the editable field policy
 * (Change & Correction Service, Phase 1).
 *
 * Controllers read validated input, call the service and choose a status code.
 * No policy decision is taken here: whether a field may be changed is a
 * property of the row the repository selects, never of the handler
 * (AGENT.md §7).
 *
 * `validateRequest` has already replaced `req.params` with the parsed object,
 * so the record type is one of the supported values by the time it is read.
 */

/**
 * `GET /api/v1/field-policies/:recordType` — the editability of every field of
 * one record type.
 *
 * The whole policy for the record type in one response, rather than a round
 * trip per field: the change form needs all of it at once to render a field as
 * editable, conditional or locked, and asking field by field would let a slow
 * response render half a form in the wrong state.
 */
export const handleGetRecordTypeFieldPolicies = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { recordType } = req.params as unknown as RecordTypeParams;
  const payload = await getRecordTypeFieldPolicies(recordType);

  res.status(HTTP_STATUS.OK).json(successBody(payload));
};

/**
 * `GET /api/v1/field-policies/:recordType/fields/:fieldKey` — one field's policy.
 *
 * The single-field read exists for the case where a client already holds a
 * field and needs the current rule for it — re-checking before it submits,
 * rather than trusting a policy it fetched with the form. It answers 404 for a
 * field no active policy governs, which is the same refusal the enforcement
 * helper makes.
 */
export const handleGetFieldPolicy = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { recordType, fieldKey } = req.params as unknown as FieldPolicyParams;
  const policy = await getFieldPolicy(recordType, fieldKey);

  res.status(HTTP_STATUS.OK).json(successBody({ recordType, ...policy }));
};
