import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../api';
import {
  CreatePatientRequest,
  UpdatePatientRequest,
  ListPatientsQuery,
  patientListResponseSchema,
  patientSchema,
} from '@zenvy/shared';

export const patientKeys = {
  all: ['patients'] as const,
  lists: () => [...patientKeys.all, 'list'] as const,
  list: (filters: ListPatientsQuery) => [...patientKeys.lists(), filters] as const,
  details: () => [...patientKeys.all, 'detail'] as const,
  detail: (id: string) => [...patientKeys.details(), id] as const,
};

export function usePatients(filters: ListPatientsQuery) {
  return useInfiniteQuery({
    queryKey: patientKeys.list(filters),
    queryFn: async ({ pageParam = undefined }) => {
      return api.get('/patients', patientListResponseSchema, {
        ...filters,
        cursor: pageParam,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn: () => api.get(`/patients/${id}`, patientSchema),
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePatientRequest) => api.post('/patients', patientSchema, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
    },
  });
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePatientRequest) => api.patch(`/patients/${id}`, patientSchema, data),
    onSuccess: (updatedPatient) => {
      queryClient.setQueryData(patientKeys.detail(id), updatedPatient);
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/patients/${id}`, z.undefined()),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: patientKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
    },
  });
}
