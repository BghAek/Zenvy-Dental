import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup.ts'],
    // DB-backed suites share one database; keep files sequential.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  // swc emits the decorator metadata NestJS DI needs (esbuild cannot).
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
