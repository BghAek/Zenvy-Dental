import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same origin as the API, the way nginx serves both in production (docs/01
// §Deploy): session cookies and Better Auth's links work in `dev` and
// `preview` without CORS. VITE_API_URL still wins when it is set, for the
// split-origin setup in docs/13-local-dev.md.
const proxy = { '/api': 'http://localhost:3001' };

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@zenvy/shared'],
  },
  server: { proxy },
  preview: { proxy },
});
