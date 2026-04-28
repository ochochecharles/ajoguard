import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema';

@Injectable()
export class DrizzleDbService {
    db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(private config: ConfigService) {
    const url = this.config.getOrThrow<string>('DATABASE_URL');
    const sql = neon(url);
    this.db = drizzle(sql, { schema });
  }
}
