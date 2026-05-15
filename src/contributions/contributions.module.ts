// The contributions module is responsible for managing contributions in the system. It provides services for creating, retrieving, updating, and deleting contributions, as well as any necessary business logic related to contributions. It interacts with the database through the DrizzleDbModule to store and retrieve contribution data.
import { Module } from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { ContributionsController } from './contributions.controller';
import { DrizzleDbModule } from 'src/db/drizzle_db/drizzle_db.module';
import { BullModule } from '@nestjs/bullmq';
import { ContributionProcessorService } from './contribution.processor/contribution.processor.service';
import { ReconciliationModule } from 'src/reconciliation/reconciliation.module';
import { AuditModule } from 'src/audit/audit.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    ReconciliationModule,
    DrizzleDbModule,
    AuditModule,
    NotificationModule,
    BullModule.registerQueue({
      name: 'contributions', // queue name
      defaultJobOptions: {
        attempts: 3,        
        backoff: {
          type: 'exponential', // wait longer between each retry
          delay: 2000,         // start at 2 seconds
        },
        removeOnComplete: false, // keep completed jobs for inspection
        removeOnFail: false,     // keep failed jobs for inspection
      },
    }),
  ],
  providers: [ContributionsService, ContributionProcessorService],
  controllers: [ContributionsController],
  exports: [ContributionsService, BullModule],
})
export class ContributionsModule {}
