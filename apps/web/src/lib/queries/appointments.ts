import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../api';
import {
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
  ListAppointmentsQuery,
  appointmentListResponseSchema,
  appointmentSchema,
} from '@zenvy/shared';

export const appointmentKeys = {
  all: ['appointments'] as const,
  lists: () => [...appointmentKeys.all, 'list'] as const,
  list: (filters: ListAppointmentsQuery) => [...appointmentKeys.lists(), filters] as const,
  details: () => [...appointmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...appointmentKeys.details(), id] as const,
};

export function useAppointments(filters: ListAppointmentsQuery) {
  return useInfiniteQuery({
    queryKey: appointmentKeys.list(filters),
    queryFn: async ({ pageParam = undefined }) => {
      return api.get('/appointments', appointmentListResponseSchema, {
        ...filters,
        cursor: pageParam,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: appointmentKeys.detail(id),
    queryFn: () => api.get(`/appointments/${id}`, appointmentSchema),
    enabled: !!id,
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAppointmentRequest) => api.post('/appointments', appointmentSchema, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
    },
  });
}

export function useUpdateAppointment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAppointmentRequest) => api.patch(`/appointments/${id}`, appointmentSchema, data),
    onSuccess: (updatedAppointment) => {
      queryClient.setQueryData(appointmentKeys.detail(id), updatedAppointment);
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
    },
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/appointments/${id}`, z.undefined()),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: appointmentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
    },
  });
}
