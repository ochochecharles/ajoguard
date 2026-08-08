import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleDbModule } from './db/drizzle_db/drizzle_db.module';
import { GroupsModule } from './groups/groups.module';
import { BullModule } from '@nestjs/bullmq';
import { MembersModule } from './members/members.module';
import { ContributionsModule } from './contributions/contributions.module';
import { NormaliserModule } from './normaliser/normaliser.module';
import { IngestModule } from './ingest/ingest.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { AuditModule } from './audit/audit.module';
import { NotificationModule } from './notification/notification.module';
import { ExportModule } from './export/export.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { BullBoardSetup } from './bull-board.setup';
import { AdminAuthMiddleware } from './auth/admin-auth.middleware';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { validate } from './config/env.validation';

@Module({
  imports: [
    // Load configuration first so all modules receive env values via ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
      {
        name: 'long',
        ttl: 3600_000,
        limit: 1000,
      },
    ]),
    AuditModule,
    GroupsModule,
    MembersModule,
    ContributionsModule,
    NormaliserModule,
    IngestModule,
    ReconciliationModule,
    DrizzleDbModule,
    NotificationModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);

        return {
          connection: redisUrl
            ? { url: redisUrl }
            : { host, port: Number(port) },
        };
      },
    }),

    BullBoardSetup,
    BullBoardModule.forFeature({
      name: 'contributions',
      adapter: BullMQAdapter,
    }),
    ExportModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AdminAuthMiddleware,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
