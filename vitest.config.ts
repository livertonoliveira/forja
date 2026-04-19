import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    // Use the automatic JSX runtime so TSX files in apps/ui do not require
    // `import React from 'react'` or a global React in scope.
    jsx: 'automatic',
    jsxImportSource: 'react',
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
