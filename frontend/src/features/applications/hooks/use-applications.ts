import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApplication, fetchApplication, fetchApplications, saveApplicationDraft, submitApplication } from '../services/application-service';
import type { ApplicationStatus } from '../types/application.types';

export const applicationKeys = {
  all: ['applications'] as const,
  lists: () => [...applicationKeys.all, 'list'] as const,
  list: (status?: ApplicationStatus) => [...applicationKeys.lists(), status ?? 'ALL'] as const,
  details: () => [...applicationKeys.all, 'detail'] as const,
  detail: (id: string) => [...applicationKeys.details(), id] as const,
};

export const useApplications = (status?: ApplicationStatus) =>
  useQuery({ queryKey: applicationKeys.list(status), queryFn: ({ signal }) => fetchApplications(status, signal) });

export const useApplication = (applicationId: string) =>
  useQuery({ queryKey: applicationKeys.detail(applicationId), queryFn: ({ signal }) => fetchApplication(applicationId, signal), enabled: applicationId.length > 0 });

export const useCreateApplication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createApplication,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
};

export const useSaveApplication = (applicationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields: Readonly<Record<string, string>>) => saveApplicationDraft(applicationId, fields),
    onSuccess: (application) => {
      queryClient.setQueryData(applicationKeys.detail(applicationId), application);
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
};

export const useSubmitApplication = (applicationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => submitApplication(applicationId),
    onSuccess: (application) => {
      queryClient.setQueryData(applicationKeys.detail(applicationId), application);
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
};
