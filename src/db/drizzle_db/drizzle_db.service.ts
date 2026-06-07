import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../schema';

@Injectable()
export class DrizzleDbService {
  db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(private config: ConfigService) {
    const url = this.config.getOrThrow<string>('DATABASE_URL');

    const pool = new Pool({
      connectionString: url,
    });

    this.db = drizzle(pool, { schema });
  }
}