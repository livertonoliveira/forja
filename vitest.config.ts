import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    // Use the automatic JSX runtime so TSX files without `import React`
    // (Next.js 17+ convention) are transformed correctly without a DOM.
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/ui'),
    },
  },
  test: {
    pool: 'forks',
  },
});
