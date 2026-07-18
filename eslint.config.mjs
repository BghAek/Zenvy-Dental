import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/out/**', '**/node_modules/**', '**/next-env.d.ts'],
  },
  ...tseslint.configs.recommended,
  prettier,
);
