import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react's version auto-detection is incompatible with ESLint 10.
    settings: { react: { version: '19.3' } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**', 'tests/**', 'e2e/**'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores([
    '.next/**',
    '.next-*/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.data/**',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
    'public/embed.js',
  ]),
])
