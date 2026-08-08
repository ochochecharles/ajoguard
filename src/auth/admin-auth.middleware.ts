import {
  Injectable,
  NestMiddleware,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { JwtAuthGuard } from './jwt.guard';

// Protects the BullBoard admin UI by running the standard JWT auth flow.
@Injectable()
export class AdminAuthMiddleware implements NestMiddleware {
  constructor(private readonly jwtAuthGuard: JwtAuthGuard) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host: ExecutionContext = new ExecutionContextHost([
      req,
      res,
      null,
      null,
    ]);
    try {
      const canActivate = await this.jwtAuthGuard.canActivate(host);
      if (!canActivate) {
        throw new UnauthorizedException();
      }
    } catch (error) {
      throw new UnauthorizedException();
    }
    return next();
  }
}