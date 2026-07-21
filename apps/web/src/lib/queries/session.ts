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
    queryFn: () => api.get('/me', meResponseSchema),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
