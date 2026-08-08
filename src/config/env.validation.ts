import { plainToInstance } from 'class-transformer';
import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsIn,
  IsUrl,
  Matches,
  ValidateIf,
} from 'class-validator';
import { validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT?: number = 3000;

  @IsUrl({ require_tld: false })
  DATABASE_URL: string;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string = 'localhost';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT?: number = 6379;

  // DB SSL
  @ValidateIf((o) => o.DATABASE_SSL !== undefined)
  @IsIn(['true', 'false', '1', '0', 'yes', 'no'])
  DATABASE_SSL?: string;

  @ValidateIf((o) => o.DATABASE_SSL_REJECT_UNAUTHORIZED !== undefined)
  @IsIn(['true', 'false', '1', '0', 'yes', 'no'])
  DATABASE_SSL_REJECT_UNAUTHORIZED?: string;

  @IsString()
  @Min(16)
  AUDIT_HMAC_SECRET: string;

  // Telegram
  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;

  @IsUrl({ require_protocol: true })
  @IsOptional()
  TELEGRAM_WEBHOOK_URL?: string;

  // Required for the webhook to accept updates (rejects 401 when missing).
  @IsString()
  @Min(8)
  TELEGRAM_WEBHOOK_SECRET: string;

  // Auth
  @IsString()
  @Min(32)
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string = '8h';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string = '30d';

  // Google OAuth
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsUrl({ require_protocol: true })
  @IsOptional()
  GOOGLE_CALLBACK_URL?: string;

  @IsUrl({ require_protocol: true })
  @IsOptional()
  CLIENT_ORIGIN?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsIn(['true', 'false', '1', '0', 'yes', 'no'])
  @IsOptional()
  SWAGGER_ENABLED?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `- ${error.property}: ${
            error.constraints
              ? Object.values(error.constraints).join(', ')
              : 'invalid value'
          }`,
      )
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${details}\n\n` +
        `Fix the values above or populate them from .env before starting the app.`,
    );
  }

  return validated;
}