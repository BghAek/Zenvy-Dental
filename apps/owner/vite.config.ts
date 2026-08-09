import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same-origin /api proxy as apps/web: session cookies and Better Auth work in
// `dev` and `preview` without CORS (docs/13-local-dev.md).
const proxy = { '/api': 'http://localhost:3001' };

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@zenvy/shared'],
  },
  server: { proxy },
  preview: { proxy },
});
