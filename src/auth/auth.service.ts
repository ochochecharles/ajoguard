import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { OtpStore } from './otp.store';
import { EmailService } from './email.service';
import { members, groups } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * The shape of data stored inside the JWT.
 * This is what req.user looks like in every protected route.
 */
export interface JwtPayload {
  collectorId: string;
  groupId:     string;
  email:       string;
  role:        string;
  name:        string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly drizzleDbService: DrizzleDbService,
    private readonly jwtService:       JwtService,
    private readonly otpStore:         OtpStore,
    private readonly emailService:     EmailService,
  ) {}

  async register(data: {
  name:          string;
  email:         string;
  phoneNumber?:  string;
  groupName:     string;
  cycleAmount:   number;
  cycleInterval: string;
}): Promise<{ message: string }> {

  const normalisedEmail = data.email.toLowerCase().trim();

  const [existing] = await this.drizzleDbService.db
    .select()
    .from(members)
    .where(eq(members.email, normalisedEmail));

  if (existing) {
    throw new ConflictException(
      'This email is already registered. Please log in instead.',
    );
  }

  // Create the group
  const [group] = await this.drizzleDbService.db
    .insert(groups)
    .values({
      name:          data.groupName,
      cycleAmount:   data.cycleAmount * 100,
      cycleInterval: data.cycleInterval,
      isActive:      true,
      totalMembers:  0,
      currentPosition: 1,
    })
    .returning();

  // Create the collector linked to that group
  const [collector] = await this.drizzleDbService.db
    .insert(members)
    .values({
      name:        data.name,
      email:       normalisedEmail,
      phoneNumber: data.phoneNumber ?? null,
      role:        'COLLECTOR',
      status:      'ACTIVE',
      groupId:     group.id,
    })
    .returning();

  // Send welcome email
  try {
    await this.emailService.sendWelcome(
      normalisedEmail,
      data.name,
      data.groupName,
    );
  } catch (error) {
    this.logger.warn(
      `Welcome email failed for ${normalisedEmail}: ${(error as Error).message}`,
    );
  }

  this.logger.log(
    `New collector registered: ${data.name} (${normalisedEmail}) — Group: ${data.groupName}`,
  );

  return {
    message: 'Registration successful. You can now log in with your email.',
  };
}

  //login flow
  async requestOtp(email: string): Promise<{ message: string }> {
    const normalisedEmail = email.toLowerCase().trim();

    // Check cooldown — prevent OTP spam
    const canRequest = await this.otpStore.canRequest(normalisedEmail);

    if (!canRequest) {
      const remaining = await this.otpStore.cooldownRemaining(normalisedEmail);
      throw new BadRequestException(
        `Please wait ${remaining} seconds before requesting another OTP`,
      );
    }

    // Look up the collector by email
    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.email, normalisedEmail));

    if (!collector || collector.role !== 'COLLECTOR') {
      this.logger.warn(
        `OTP requested for unknown or non-collector email: ${normalisedEmail}`,
      );
      return {
        message: 'If this email is registered, an OTP has been sent',
      };
    }

    if (collector.status === 'INACTIVE') {
      throw new BadRequestException(
        'This account has been deactivated. Contact your group administrator.',
      );
    }

    const otp = this.generateOtp();
    await this.otpStore.set(normalisedEmail, otp);

    try {
      await this.emailService.sendOtp(normalisedEmail, collector.name, otp);
    } catch (error) {
      // Clean up the stored OTP since we could not deliver it
      await this.otpStore.set(normalisedEmail, '______');
      this.logger.error(
        `OTP email delivery failed for ${normalisedEmail}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to send OTP email. Please try again.',
      );
    }

    return {
      message: 'If this email is registered, an OTP has been sent',
    };
  }

  async verifyOtp(
    email: string,
    otp: string,
  ): Promise<{
    accessToken: string;
    expiresIn:   string;
    collector:   object;
  }> {
    const normalisedEmail = email.toLowerCase().trim();

    // Verify OTP against Redis
    // This also deletes the OTP after a successful match
    const valid = await this.otpStore.verify(normalisedEmail, otp);

    if (!valid) {
      throw new UnauthorizedException(
        'Invalid or expired OTP. Please request a new code.',
      );
    }

    // Fetch fresh collector data from database
    // We fetch again rather than relying on cached data
    // in case the collector was deactivated between OTP request and verify
    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.email, normalisedEmail));

    if (!collector || collector.role !== 'COLLECTOR') {
      throw new UnauthorizedException('Access denied');
    }

    if (collector.status === 'INACTIVE') {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact your group administrator.',
      );
    }

    // Build the JWT payload
    const payload: JwtPayload = {
      collectorId: collector.id,
      groupId:     collector.groupId,
      email:       normalisedEmail,
      role:        collector.role,
      name:        collector.name,
    };

    // Sign the JWT
    const accessToken = this.jwtService.sign(payload);

    this.logger.log(
      `Collector "${collector.name}" logged in successfully`,
    );

    return {
      accessToken,
      expiresIn: '8h',
      collector: {
        id:          collector.id,
        name:        collector.name,
        email:       collector.email,
        groupId:     collector.groupId,
        role:        collector.role,
      },
    };
  }

   // Generates a cryptographically secure 6-digit OTP.
  private generateOtp(): string {
    const { randomInt } = require('crypto');
    const code = randomInt(100000, 1000000);
    return code.toString();
  }
}