import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../schema';

@Injectable()
export class DrizzleDbService {
  db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(private config: ConfigService) {
    const url = this.config.getOrThrow<string>('DATABASE_URL');

    // Read SSL flags from env/config so local dev can disable SSL while production can keep it enabled
    const sslEnv = this.config.get<string>('DATABASE_SSL');
    const useSsl =
      sslEnv === undefined
        ? true
        : ['true', '1', 'yes'].includes(sslEnv.toLowerCase());

    const rejectUnauthorizedEnv = this.config.get<string>(
      'DATABASE_SSL_REJECT_UNAUTHORIZED',
    );
    // Default to TRUE (verify the server cert) so production DB traffic is
    // protected from MITM. Local dev can explicitly disable with "false".
    const rejectUnauthorized =
      rejectUnauthorizedEnv === undefined
        ? true
        : ['true', '1', 'yes'].includes(rejectUnauthorizedEnv.toLowerCase());

    // Log diagnostic info (no secrets) to help debug SSL behavior
    try {
      const hasSslModeRequire = /sslmode=require/i.test(url);
      Logger.log(
        `[DrizzleDbService] DATABASE_SSL env='${sslEnv}', useSsl=${useSsl}, DATABASE_SSL_REJECT_UNAUTHORIZED env='${rejectUnauthorizedEnv}', rejectUnauthorized=${rejectUnauthorized}, url_has_sslmode_require=${hasSslModeRequire}`,
      );
    } catch (e) {
      // ignore logging errors
    }

    const pool = new Pool({
      connectionString: url,
      ssl: useSsl ? { rejectUnauthorized } : false,
    });

    this.db = drizzle(pool, { schema });
  }
}
