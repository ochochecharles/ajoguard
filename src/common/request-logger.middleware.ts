import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface AuthUser {
  collectorId?: string;
  groupId?: string;
}

/**
 * Structured request logging middleware.
 *
 * Assigns a requestId (honouring an inbound X-Request-Id if present) and logs a
 * single structured line per request: method, path, status, duration, and any
 * active collector/group context attached by the auth guard.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', requestId);

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const user = (req as Request & { user?: AuthUser }).user;
      const actor = user
        ? `collector=${user.collectorId ?? '-'} group=${user.groupId ?? '-'}`
        : 'anon';

      const message = JSON.stringify({
        ts: new Date().toISOString(),
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: durationMs.toFixed(1),
        actor,
      });

      if (res.statusCode >= 500) {
        this.logger.error(message);
      } else if (res.statusCode >= 400) {
        this.logger.warn(message);
      } else {
        this.logger.log(message);
      }
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        this.logger.warn(
          `Aborted request ${req.method} ${req.originalUrl} for ${requestId}`,
        );
      }
    });

    next();
  }
}
