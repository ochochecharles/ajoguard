import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { members } from '../db/schema';
import { eq } from 'drizzle-orm';
import { JwtPayload } from './auth.service';

/**
 * JwtStrategy validates every incoming JWT on protected routes.
 *
 * How it works:
 *   1. Passport extracts the token from the Authorization header
 *   2. Passport verifies the signature using JWT_SECRET
 *   3. Passport calls validate() with the decoded payload
 *   4. validate() fetches fresh data from the database
 *   5. Whatever validate() returns becomes req.user
 *
 * This runs automatically on every request that has
 * the @UseGuards(JwtAuthGuard) decorator applied.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly drizzleDbService: DrizzleDbService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Validate the decoded JWT payload and return a minimal user object.
   *
   * This method is called after Passport verifies the token signature.
   * It ensures the member still exists, is active, and has collector access.
   * If validation succeeds, the returned object becomes `req.user`.
   */
  async validate(payload: JwtPayload) {
    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.id, payload.collectorId));

    if (!collector) {
      throw new UnauthorizedException(
        'Account not found. Please contact your group administrator.',
      );
    }

    if (collector.status === 'INACTIVE') {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact your group administrator.',
      );
    }

    // Both collectors and members authenticate. Members are read-only:
    // write routes carry @Roles('COLLECTOR') which the RolesGuard enforces.

    // This object becomes req.user in every protected controller
    return {
      collectorId: collector.id,
      groupId: collector.groupId,
      email: collector.email,
      name: collector.name,
      role: collector.role,
    };
  }
}
