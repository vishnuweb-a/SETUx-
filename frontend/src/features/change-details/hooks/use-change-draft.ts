import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createChangeDraft,
  fetchChangeDraft,
  updateChangeDraft,
} from '../services/change-draft-service';
import type {
  ChangeDraftDetail,
  ChangeDraftFieldInput,
} from '../types/change-draft.types';

export const changeDraftKeys = {
  all: ['change-drafts'] as const,
  detail: (changeRequestId: string) => [...changeDraftKeys.all, changeRequestId] as const,
};

/**
 * One draft, read from the server.
 *
 * The query is what makes the edit screen refresh-safe: it does not read the
 * citizen's entered values out of navigation state, it reads them out of the
 * database. Closing the tab and returning to the URL restores the draft.
 *
 * `retry: false` for a 404. A draft that is not the caller's answers 404 by
 * design, and retrying it three times before showing the citizen the
 * not-found screen only makes an already-correct answer slower.
 */
export const useChangeDraft = (changeRequestId: string) =>
  useQuery({
    queryKey: changeDraftKeys.detail(changeRequestId),
    queryFn: ({ signal }) => fetchChangeDraft(changeRequestId, signal),
    enabled: changeRequestId.length > 0,
  });

/**
 * Creates a draft and adopts the server's answer as the new truth.
 *
 * The response is seeded into the cache under the new draft's id, so the
 * navigation that follows lands on a screen whose data is already present
 * rather than refetching what was just returned.
 *
 * Nothing is written optimistically. A draft carries authorization rules the
 * client cannot evaluate — whether each field is still correctable, what the
 * source actually holds — so showing the citizen a saved draft before the
 * server has agreed would be showing them something that may not be true.
 */
export const useCreateChangeDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      readonly sourceRecordId: string;
      readonly fields: readonly ChangeDraftFieldInput[];
    }) => createChangeDraft(input),
    onSuccess: (draft: ChangeDraftDetail) => {
      queryClient.setQueryData(changeDraftKeys.detail(draft.id), draft);
    },
  });
};

/**
 * Revises an existing draft.
 *
 * The server's response replaces the cached draft wholesale rather than being
 * merged into it. That is deliberate: the response carries the authoritative
 * `oldValue` for every field, and a merge that preserved the client's idea of
 * those values could leave the screen showing a snapshot the server never
 * confirmed.
 */
export const useUpdateChangeDraft = (changeRequestId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fields: readonly ChangeDraftFieldInput[]) =>
      updateChangeDraft(changeRequestId, { fields }),
    onSuccess: (draft: ChangeDraftDetail) => {
      queryClient.setQueryData(changeDraftKeys.detail(draft.id), draft);
    },
  });
};
