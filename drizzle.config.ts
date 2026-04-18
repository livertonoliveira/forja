import type { Config } from 'drizzle-kit';

export default {
  schema: './src/store/drizzle/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: (() => {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL env var is required');
      return process.env.DATABASE_URL;
    })(),
  },
} satisfies Config;
