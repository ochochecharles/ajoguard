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
    ssl: true,
  },
  // Log what Drizzle Kit is doing
  verbose: true,
  strict: true,
} satisfies Config;