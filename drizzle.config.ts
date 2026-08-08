import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load .env manually because this file runs outside of NestJS
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in your .env file');
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
    // Allow toggling SSL via DATABASE_SSL env var (defaults to true)
    ssl: (() => {
      const val = process.env.DATABASE_SSL;
      if (val === undefined) return true;
      return ['true', '1', 'yes'].includes(val.toLowerCase());
    })(),
  },
  // Log what Drizzle Kit is doing
  verbose: true,
  strict: true,
} satisfies Config;