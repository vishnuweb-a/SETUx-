import { apiRequest } from '@/services/api-client';
import type { ApplicationDetail, ApplicationListPayload, ApplicationStatus } from '../types/application.types';

export const createApplication = (serviceId: string): Promise<ApplicationDetail> =>
  apiRequest('/applications', { method: 'POST', body: JSON.stringify({ service_id: serviceId }) });

export const fetchApplications = (status?: ApplicationStatus, signal?: AbortSignal): Promise<ApplicationListPayload> => {
  const query = status ? `?status=${status}` : '';
  return apiRequest(`/applications${query}`, { signal });
};

export const fetchApplication = (applicationId: string, signal?: AbortSignal): Promise<ApplicationDetail> =>
  apiRequest(`/applications/${encodeURIComponent(applicationId)}`, { signal });

export const saveApplicationDraft = (applicationId: string, fields: Readonly<Record<string, string>>): Promise<ApplicationDetail> =>
  apiRequest(`/applications/${encodeURIComponent(applicationId)}`, { method: 'PATCH', body: JSON.stringify({ fields }) });

export const submitApplication = (applicationId: string): Promise<ApplicationDetail> =>
  apiRequest(`/applications/${encodeURIComponent(applicationId)}/submit`, { method: 'POST', body: '{}' });
