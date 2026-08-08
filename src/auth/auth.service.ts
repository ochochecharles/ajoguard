import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { randomInt, randomBytes } from 'crypto';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { members, groups } from '../db/schema';
import { eq } from 'drizzle-orm';
import { normalisePhoneNumber } from '../utils/phone.util';

type Member = typeof members.$inferSelect;
type Group = typeof groups.$inferSelect;

/**
 * The shape of data stored inside the JWT.
 * This is what req.user looks like in every protected route.
 */
export interface JwtPayload {
  collectorId: string;
  groupId: string;
  email: string;
  role: string;
  name: string;
  tokenType: 'access' | 'refresh';
}

/**
 * Shape returned from login/registration. The JWT token stays minimal;
 * the join code is surfaced in the response body only, so a collector can
 * actually share it with their members.
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  collector: {
    id: string;
    name: string;
    email: string;
    groupId: string;
    role: string;
    joinCode: string | null;
  };
}

/**
 * Registration data passed through the OAuth `state` parameter
 * (encoded as base64url JSON) so the callback knows whether the
 * user is logging in, starting a group (collector) or joining one.
 */
export interface OAuthState {
  groupName?: string;
  cycleAmount?: number;
  cycleInterval?: string;
  joinCode?: string;
  phoneNumber?: string;
}

export interface GoogleRegisterData {
  idToken: string;
  groupName?: string;
  cycleAmount?: number;
  cycleInterval?: string;
  joinCode?: string;
  name?: string;
  phoneNumber: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;
  private readonly oauthClient: OAuth2Client;

  constructor(
    private readonly drizzleDbService: DrizzleDbService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
    this.oauthClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  /**
   * Verify a Google ID token received from the SPA/Mobile client.
   */
  async verifyGoogleIdToken(
    idToken: string,
  ): Promise<{ email: string; name: string }> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token payload');
      }
      return {
        email: payload.email.toLowerCase().trim(),
        name: payload.name || payload.email.split('@')[0],
      };
    } catch (error) {
      this.logger.error(
        `Google token verification failed: ${(error as Error).message}`,
      );
      throw new UnauthorizedException('Invalid or expired Google token');
    }
  }

  /**
   * Build the Google consent-screen URL for the server-side OAuth flow.
   * `state` carries the OAuthState payload that we get back on the callback.
   */
  getGoogleAuthUrl(state: string): string {
    return this.oauthClient.generateAuthUrl({
      access_type: 'online',
      scope: ['email', 'profile'],
      state,
      redirect_uri: this.configService.get<string>('GOOGLE_CALLBACK_URL'),
    });
  }

  /**
   * Exchange the OAuth authorization code for an ID token, verify it,
   * then login / register the user depending on the `state` passed in.
   *
   * Returns an AjoGuard JWT so the whole flow is testable end-to-end
   * (e.g. from Postman with redirect-following enabled).
   */
  async handleGoogleCallback(
    code: string,
    state: string,
  ): Promise<AuthResponse> {
    const { tokens } = await this.oauthClient.getToken({
      code,
      redirect_uri: this.configService.get<string>('GOOGLE_CALLBACK_URL'),
    });

    if (!tokens.id_token) {
      throw new UnauthorizedException(
        'Google did not return an ID token. Check the callback URL matches the one configured in Google Cloud Console.',
      );
    }

    const googleUser = await this.verifyGoogleIdToken(tokens.id_token);
    const params = this.consumeOAuthState(state);

    // 1) Already registered -> plain login
    const [existing] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.email, googleUser.email));

    if (existing) {
      this.assertCanLogin(existing);
      return await this.issueJwtResponse(existing);
    }

    // 2) Joining an existing group via join code
    if (params.joinCode) {
      if (!params.phoneNumber) {
        throw new BadRequestException(
          'A phone number is required to join a group via Google OAuth.',
        );
      }
      const member = await this.joinGroupByCode({
        email: googleUser.email,
        name: googleUser.name,
        joinCode: params.joinCode,
        phoneNumber: params.phoneNumber,
      });
      return await this.issueJwtResponse(member);
    }

    // 3) Starting a new group as collector
    if (params.groupName && params.cycleAmount && params.cycleInterval) {
      if (!params.phoneNumber) {
        throw new BadRequestException(
          'A phone number is required to register as a collector via Google OAuth.',
        );
      }
      const collector = await this.registerCollector({
        email: googleUser.email,
        name: googleUser.name,
        groupName: params.groupName,
        cycleAmount: params.cycleAmount,
        cycleInterval: params.cycleInterval,
        phoneNumber: params.phoneNumber,
      });
      return await this.issueJwtResponse(collector);
    }

    throw new BadRequestException(
      'No account found for this Google email. To register, retry /auth/google with groupName, cycleAmount and cycleInterval=weekly|monthly (to start a group), or joinCode=<code> (to join an existing group).',
    );
  }

  /**
   * Authenticate an existing collector using a Google ID token.
   */
  async googleLogin(idToken: string): Promise<AuthResponse> {
    const { email } = await this.verifyGoogleIdToken(idToken);

    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.email, email));

    if (!collector) {
      throw new NotFoundException(
        'No registered account found for this Google email. Please register your group first.',
      );
    }

    this.assertCanLogin(collector);

    return await this.issueJwtResponse(collector);
  }

  /**
   * Register a new collector + savings group (or join an existing group
   * via join code) using a Google ID token from the SPA/Mobile client.
   */
  async googleRegister(data: GoogleRegisterData): Promise<AuthResponse> {
    const googleUser = await this.verifyGoogleIdToken(data.idToken);
    const email = googleUser.email;
    const name = (data.name || googleUser.name).trim();

    if (data.joinCode) {
      const member = await this.joinGroupByCode({
        email,
        name,
        joinCode: data.joinCode,
        phoneNumber: data.phoneNumber,
      });
      return await this.issueJwtResponse(member);
    }

    if (!data.groupName || !data.cycleAmount || !data.cycleInterval) {
      throw new BadRequestException(
        'To register as a collector provide groupName, cycleAmount and cycleInterval. To join a group provide joinCode.',
      );
    }

    const collector = await this.registerCollector({
      email,
      name,
      groupName: data.groupName,
      cycleAmount: data.cycleAmount,
      cycleInterval: data.cycleInterval,
      phoneNumber: data.phoneNumber,
    });
    return await this.issueJwtResponse(collector);
  }

  /**
   * Create a new savings group (with a unique join code) and its collector.
   */
  private async registerCollector(reg: {
    email: string;
    name: string;
    groupName: string;
    cycleAmount: number;
    cycleInterval: string;
    phoneNumber: string;
  }): Promise<Member> {
    const [existing] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.email, reg.email));

    if (existing) {
      throw new ConflictException(
        'This email is already registered. Please log in instead.',
      );
    }

    const joinCode = this.generateJoinCode();

    // Group + collector are created atomically so a mid-way failure
    // never leaves an orphan group behind.
    const collector = await this.drizzleDbService.db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({
          name: reg.groupName,
          joinCode,
          cycleAmount: reg.cycleAmount * 100,
          cycleInterval: reg.cycleInterval.toLowerCase(),
          isActive: true,
          totalMembers: 0,
          currentPosition: 1,
        })
        .returning();

      const [collectorRow] = await tx
        .insert(members)
        .values({
          name: reg.name,
          email: reg.email,
          phoneNumber: normalisePhoneNumber(reg.phoneNumber),
          role: 'COLLECTOR',
          status: 'ACTIVE',
          groupId: group.id,
        })
        .returning();

      return collectorRow;
    });

    this.logger.log(
      `New collector registered: ${reg.name} (${reg.email}) — Group: ${reg.groupName} (joinCode ${joinCode})`,
    );

    return collector;
  }

  /**
   * Add a new member to an existing group using its join code.
   */
  private async joinGroupByCode(join: {
    email: string;
    name: string;
    joinCode: string;
    phoneNumber: string;
  }): Promise<Member> {
    const [existing] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.email, join.email));

    if (existing) {
      throw new ConflictException(
        'This email is already registered. Please log in instead.',
      );
    }

    // Member insert + totalMembers increment happen atomically so
    // concurrent joins cannot miscount the roster.
    const member = await this.drizzleDbService.db.transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(groups)
        .where(eq(groups.joinCode, join.joinCode));

      if (!group) {
        throw new NotFoundException(
          `No group found with join code "${join.joinCode}". Check the code and try again.`,
        );
      }

      if (!group.isActive) {
        throw new BadRequestException(
          'This group is no longer accepting new members.',
        );
      }

      const [memberRow] = await tx
        .insert(members)
        .values({
          name: join.name,
          email: join.email,
          phoneNumber: normalisePhoneNumber(join.phoneNumber),
          role: 'MEMBER',
          status: 'ACTIVE',
          groupId: group.id,
        })
        .returning();

      await tx
        .update(groups)
        .set({ totalMembers: group.totalMembers + 1 })
        .where(eq(groups.id, group.id));

      return memberRow;
    });

    this.logger.log(
      `New member joined group "${join.name}": ${join.name} (${join.email})`,
    );

    return member;
  }

  private generateJoinCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[randomInt(chars.length)];
    }
    return code;
  }

  // Server-side OAuth `state` store: random nonce -> registration params.
  // Storing params server-side means an attacker cannot craft a state value
  // to force a victim into registering/joining an attacker-chosen group (login CSRF).
  private readonly oauthStateStore = new Map<
    string,
    { params: OAuthState; expiresAt: number }
  >();
  private readonly OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Create a random, one-time `state` nonce backed by the server-side store.
   * Returns the opaque state string to embed in the Google consent URL.
   */
  createOAuthState(params: OAuthState): string {
    const state = randomBytes(32).toString('base64url');
    this.oauthStateStore.set(state, {
      params,
      expiresAt: Date.now() + this.OAUTH_STATE_TTL_MS,
    });
    return state;
  }

  /**
   * Resolve and consume a one-time `state` nonce back to its stored params.
   * Unknown/expired/replayed states are rejected.
   */
  consumeOAuthState(state: string): OAuthState {
    if (!state) {
      throw new UnauthorizedException('Missing OAuth state');
    }

    const entry = this.oauthStateStore.get(state);
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    if (Date.now() > entry.expiresAt) {
      this.oauthStateStore.delete(state);
      throw new UnauthorizedException('OAuth state expired');
    }

    // One-time use: immediately invalidate after first consumption.
    this.oauthStateStore.delete(state);
    return entry.params;
  }

  private assertCanLogin(collector: Member): void {
    // Both collectors and read-only members may log in.
    // Write actions are enforced separately via the RolesGuard.
    if (collector.status === 'INACTIVE') {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact your group administrator.',
      );
    }
  }

  /**
   * Internal helper to generate and return the AjoGuard JWT token payload.
   */
  private async issueJwtResponse(collector: Member): Promise<AuthResponse> {
    const basePayload: JwtPayload = {
      collectorId: collector.id,
      groupId: collector.groupId,
      email: collector.email ?? '',
      role: collector.role,
      name: collector.name,
      tokenType: 'access',
    };

    const accessToken = this.jwtService.sign(basePayload);
    const expiresIn = this.configService.get<string>(
      'JWT_EXPIRES_IN',
      '8h',
    );

    const refreshToken = this.jwtService.sign(
      { ...basePayload, tokenType: 'refresh', email: undefined },
      {
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '30d',
        ) as JwtSignOptions['expiresIn'],
      },
    );

    const [group] = await this.drizzleDbService.db
      .select({ joinCode: groups.joinCode })
      .from(groups)
      .where(eq(groups.id, collector.groupId));

    this.logger.log(
      `Collector "${collector.name}" authenticated successfully via Google`,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn,
      collector: {
        id: collector.id,
        name: collector.name,
        email: collector.email ?? '',
        groupId: collector.groupId,
        role: collector.role,
        joinCode: group?.joinCode ?? null,
      },
    };
  }

  /**
   * Exchange a valid refresh token for a fresh access token (and a rotated
   * refresh token). Members are revalidated against the DB on every call so
   * deactivated accounts are rejected immediately.
   */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.id, payload.collectorId));

    if (!collector) {
      throw new UnauthorizedException(
        'Account not found. Please contact your group administrator.',
      );
    }

    this.assertCanLogin(collector);

    return this.issueJwtResponse(collector);
  }
}
