import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClinicRequestSchema, createClinicResponseSchema } from '@zenvy/shared';
import { z } from 'zod';
import { api } from '../api';
import { sessionKeys } from './session';

export function useCreateClinic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: z.infer<typeof createClinicRequestSchema>) => {
      try {
        const res = await api.post('/clinics', createClinicResponseSchema, payload);
        
        // Store in localStorage for the mock environment
        const clinic = res.clinic;
        if (clinic) {
          localStorage.setItem('zenvy_mock_clinic', JSON.stringify(clinic));
        }
        
        return res;
      } catch (err) {
        console.warn('API /clinics failed, falling back to mock.', err);
        // Fallback to simulating the creation
        const newClinic = {
          id: `mock-clinic-${Math.random().toString(36).substr(2, 9)}`,
          name: payload.name,
          slug: payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          phone: payload.phone || null,
          address: payload.address || null,
          timezone: payload.timezone || 'Europe/Paris',
          locale: 'fr',
          onboardingStatus: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        localStorage.setItem('zenvy_mock_clinic', JSON.stringify(newClinic));
        await new Promise(resolve => setTimeout(resolve, 800));
        
        return { clinic: newClinic, subscription: null };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.me });
    },
  });
}
