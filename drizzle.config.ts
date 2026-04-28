import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load .env manually because this file runs outside of NestJS
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in your .env file');
}

export default {
  // Where your schema file(s) live
  schema: './src/db/schema.ts',

  // Where generated SQL migration files will be saved
  out: './drizzle',

  // We're using Neon = PostgreSQL
  dialect: 'postgresql',

  dbCredentials: {
    url: process.env.DATABASE_URL,
  },

  // Log what Drizzle Kit is doing
  verbose: true,
  strict: true,
} satisfies Config;