import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
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

@Module({
  imports: [
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
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'), // Production url
        },
      }),
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'contributions',
      adapter: BullMQAdapter,
    }),
    ExportModule,
    AuthModule,
    
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
