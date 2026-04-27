import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/ui'),
    },
  },
  test: {
    pool: 'forks',
    include: ['tests/**/*.{test,spec}.{ts,js}', 'src/**/*.{test,spec}.{ts,js}', 'scripts/__tests__/**/*.{test,spec}.{ts,js}'],
    // bin/ contains compiled JS test files that should not be re-run
    // ui-components imports TSX/JSX — run from apps/ui/ where React is configured
    exclude: [
      '**/node_modules/**',
      'bin/**',
      'dist/**',
      'tests/unit/ui-components.unit.test.ts',
    ],
  },
});
