import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';
import { AdminAuthMiddleware } from './admin-auth.middleware';
import { DrizzleDbModule } from '../db/drizzle_db/drizzle_db.module';

@Module({
  imports: [
    DrizzleDbModule,
    PassportModule,

    // Register JWT module with async config
    // so we can read JWT_SECRET from ConfigService
    // after .env has been loaded
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '8h',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    AdminAuthMiddleware,
  ],

  controllers: [AuthController],
  exports: [
    JwtAuthGuard,
    RolesGuard,
    AdminAuthMiddleware,
    AuthService,
    JwtModule,
  ],
})
export class AuthModule {}
