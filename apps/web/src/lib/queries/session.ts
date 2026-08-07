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
      // No fallback session: an unreachable API must surface as an error, not
      // as a signed-in dentist (RequireAuth renders the retry state).
      const data = await api.get('/me', meResponseSchema);

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

