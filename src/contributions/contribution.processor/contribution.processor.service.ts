import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ContributionEvent } from '../interfaces/contribution-event.interface';
import { ContributionsService } from '../contributions.service';
import { ReconciliationService } from '../../reconciliation/reconciliation.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notification/notification.service';

// the background engine that picks jobs off the queue and processes them
@Processor('contributions')
export class ContributionProcessorService extends WorkerHost {
  private readonly logger = new Logger(ContributionProcessorService.name);

  constructor(
    private readonly contributionsService: ContributionsService,
    private readonly reconciliationService: ReconciliationService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<ContributionEvent>): Promise<void> {
    const event = job.data;

    this.logger.log(
      `Processing contribution job ${job.id} for member ${event.memberId}`,
    );

    try {
      await job.updateProgress(10);

      // Mark as processed BEFORE reconciliation so the just-recorded
      // contribution is counted. Otherwise it would still be PENDING and
      // the group would falsely be flagged as having a DISCREPANCY.
      await this.contributionsService.updateStatus(event.eventId, 'PROCESSED');
      await job.updateProgress(25);

      // Reconciliation
      const reconciliationResult =
        await this.reconciliationService.reconcileGroup(event.groupId);

      this.logger.log(
        `[Reconciliation] Group ${event.groupId} status: ${reconciliationResult?.status}`,
      );
      await job.updateProgress(40);

      // Audit log
      await this.auditService.writeAuditLog(event);
      this.logger.log(
        `[AuditLog] Tamper-evident record written for event ${event.eventId}`,
      );
      await job.updateProgress(70);

      // Notifications
      // Send confirmation to the member who paid
      await this.notificationService.sendContributionConfirmation(event);

      // If reconciliation found missing members send alert to collector
      if (
        reconciliationResult &&
        reconciliationResult.missingMembers?.length > 0
      ) {
        await this.notificationService.sendMissingPaymentAlert(
          event.groupId,
          reconciliationResult.missingMembers,
        );
      }

      await job.updateProgress(90);

      await job.updateProgress(100);

      this.logger.log(`✅ Job ${job.id} completed successfully`);
    } catch (error) {
      await this.contributionsService.updateStatus(
        event.eventId,
        'FAILED',
        (error as Error).message,
      );

      this.logger.error(`❌ Job ${job.id} failed: ${(error as Error).message}`);

      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.warn(
      `Job ${job.id} failed attempt ${job.attemptsMade}/${job.opts.attempts}: ${error.message}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(
      `Job ${job.id} completed after ${job.attemptsMade} attempt(s)`,
    );
  }
}
