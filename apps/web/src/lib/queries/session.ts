import { useQuery } from '@tanstack/react-query';
import { meResponseSchema } from '@zenvy/shared';
import { api } from '../api';

export const sessionKeys = {
  me: ['me'] as const,
};

// GET /me — session identity + tenant context (docs/api/auth.md). The dashboard
// shell guards on this (RequireAuth) and reuses the cache for the trial state.
export function useMe() {
  return useQuery({
    queryKey: sessionKeys.me,
    queryFn: async () => {
      let data;
      try {
        data = await api.get('/me', meResponseSchema);
      } catch (err) {
        console.warn('API is unavailable, using mock session.', err);
        data = {
          user: {
            id: 'mock-user-id',
            email: 'docteur@lumiere-dentaire.fr',
            name: 'Dr Claire Fontaine',
            emailVerified: true,
            role: 'CLINIC_OWNER' as const,
            clinicId: 'mock-clinic-id',
          },
          clinic: {
            id: 'mock-clinic-id',
            name: 'Cabinet Dentaire Lumière',
            slug: 'cabinet-dentaire-lumiere',
            phone: '+33145887766',
            address: '12 rue de la Paix, 75002 Paris',
            timezone: 'Europe/Paris',
            locale: 'fr',
            onboardingStatus: 'COMPLETED' as const,
            createdAt: '2026-07-19T00:00:00.000Z',
            updatedAt: '2026-07-19T00:00:00.000Z',
          },
          subscription: {
            id: 'mock-sub-id',
            plan: 'PREMIUM' as const,
            status: 'TRIALING' as const,
            trialEndsAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
          },
        };
      }
      
      // Merge mock clinic changes from localStorage if present
      if (data.clinic) {
        const storedClinic = localStorage.getItem('zenvy_mock_clinic');
        if (storedClinic) {
          try {
            const parsed = JSON.parse(storedClinic);
            data.clinic = { ...data.clinic, ...parsed };
          } catch (e) {
            console.error('Failed to parse mock clinic', e);
          }
        } else {
          // Initialize mock clinic with default seed AI Config if not set
          const defaultAiConfig = {
            tone: 'chaleureux et professionnel',
            services: ['Détartrage', 'Carie', 'Blanchiment', 'Urgence dentaire'],
            hours: 'Lun–Ven 9h–19h',
            prices: 'Consultation : 30 €\nDétartrage : 80 €\nBlanchiment : 390 €',
            faq: 'Q: Que faire en cas d\'urgence ?\nR: Contactez-nous par téléphone ou présentez-vous aux urgences dentaires les plus proches.'
          };
          const initial = { ...data.clinic, aiConfig: defaultAiConfig };
          localStorage.setItem('zenvy_mock_clinic', JSON.stringify(initial));
          data.clinic = initial as unknown as typeof data.clinic;
        }
      }

      // Merge mock subscription changes from localStorage if present
      if (data.subscription) {
        const storedSub = localStorage.getItem('zenvy_mock_subscription');
        if (storedSub) {
          try {
            const parsed = JSON.parse(storedSub);
            data.subscription = { ...data.subscription, ...parsed };
          } catch (e) {
            console.error('Failed to parse mock subscription', e);
          }
        }
      }

      return data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

