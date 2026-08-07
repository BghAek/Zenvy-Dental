import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClinicRequestSchema, createClinicResponseSchema } from '@zenvy/shared';
import { z } from 'zod';
import { api } from '../api';
import { sessionKeys } from './session';

export function useCreateClinic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: z.infer<typeof createClinicRequestSchema>) => {
      // A failure here has to reach the wizard's error alert: a clinic that was
      // never created starts no trial, and inventing one hides that until the
      // dentist's first real patient message.
      const res = await api.post('/clinics', createClinicResponseSchema, payload);

      // Seeds the settings screens, which still edit the clinic locally.
      if (res.clinic) {
        localStorage.setItem('zenvy_mock_clinic', JSON.stringify(res.clinic));
      }

      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.me });
    },
  });
}
