import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * OtpStore manages OTP lifecycle in Redis.
 *
 * Each OTP is stored with a 5-minute TTL to reduce replay risk — Redis automatically
 * deletes it after expiry so no manual cleanup is needed.
 *
 * A 60-second cooldown key prevents OTP spam — one request per minute
 * per email address.
 */
@Injectable()
export class OtpStore implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(OtpStore.name);
  private readonly OTP_TTL_SECONDS = 300;
  private readonly COOLDOWN_SECONDS = 60;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      // Reconnect automatically if connection drops
      retryStrategy: (times) => Math.min(times * 500, 3000),
    });

    this.redis.on('connect', () => {
      this.logger.log('OTP store connected to Redis');
    });

    this.redis.on('error', (err) => {
      this.logger.error('OTP store Redis error: ' + err.message);
    });
  }

  /**
   * Store an OTP for the given email with a 5-minute expiry.
   * Overwrites any existing OTP for that email.
   */
  async set(email: string, otp: string): Promise<void> {
    const key = this.otpKey(email);
    await this.redis.set(key, otp, 'EX', this.OTP_TTL_SECONDS);
    this.logger.log(`OTP stored for ${email}, expires in ${this.OTP_TTL_SECONDS}s`);
  }

  /**
   * Verify the submitted OTP against what is stored in Redis.
   *
   * Deletes the OTP immediately after a successful match.
   * This means each OTP can only be used once — a used OTP
   * cannot be replayed even if it has not expired yet.
   *
   * @returns true if OTP matches, false if expired or incorrect
   */
  async verify(email: string, otp: string): Promise<boolean> {
    const key = this.otpKey(email);
    const stored = await this.redis.get(key);

    if (!stored) {
      this.logger.warn(`OTP lookup failed for ${email} — expired or never requested`);
      return false;
    }

    if (stored !== otp) {
      this.logger.warn(`Incorrect OTP attempt for ${email}`);
      return false;
    }

    await this.redis.del(key);
    this.logger.log(`OTP verified and consumed for ${email}`);
    return true;
  }

  /**
   * Check whether this email is within the 60-second cooldown window.
   *
   * Returns true if the email CAN make a new OTP request.
   * Returns false if they must wait.
   *
   * Sets the cooldown key on first call so subsequent calls
   * within 60 seconds return false.
   */
  async canRequest(email: string): Promise<boolean> {
    const cooldownKey = this.cooldownKey(email);
    const exists = await this.redis.exists(cooldownKey);

    if (exists) {
      const ttl = await this.redis.ttl(cooldownKey);
      this.logger.warn(`OTP cooldown active for ${email}, ${ttl}s remaining`);
      return false;
    }

    await this.redis.set(cooldownKey, '1', 'EX', this.COOLDOWN_SECONDS);
    return true;
  }

  /**
   * Returns how many seconds remain on the cooldown for this email.
   * Returns 0 if no cooldown is active.
   */
  async cooldownRemaining(email: string): Promise<number> {
    const ttl = await this.redis.ttl(this.cooldownKey(email));
    return ttl > 0 ? ttl : 0;
  }

  private otpKey(email: string): string {
    return `otp:${email.toLowerCase()}`; 
  }

  private cooldownKey(email: string): string {
    return `otp_cooldown:${email.toLowerCase()}`;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}