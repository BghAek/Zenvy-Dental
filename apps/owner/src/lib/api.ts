import { createApiClient } from '@zenvy/shared';

// Same-origin by default (nginx proxies /api); VITE_API_URL overrides in local dev.
export const api = createApiClient(import.meta.env.VITE_API_URL ?? '');
