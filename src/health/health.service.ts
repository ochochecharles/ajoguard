import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private startedAt = new Date();
  private lastError: string | null = null;

  constructor(private readonly drizzleDbService: DrizzleDbService) {}

  getStatus() {
    return {
      status: this.lastError ? 'degraded' : 'ok',
      uptimeSeconds: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  async dbOk(): Promise<boolean> {
    try {
      // Cheap heartbeat query against the connected pool.
      await this.drizzleDbService.db.execute(sql`SELECT 1`);
      this.lastError = null;
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error(`Database health check failed: ${this.lastError}`);
      return false;
    }
  }

  async check(): Promise<void> {
    await this.dbOk();
  }
}
