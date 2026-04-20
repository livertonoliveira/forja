import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/ui'),
    },
  },
  test: {
    pool: 'forks',
  },
});
