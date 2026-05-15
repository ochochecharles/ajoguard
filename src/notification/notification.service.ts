// src/notification/notification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import {
  members,
  groups,
  contributions,
  notificationLogs,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { ContributionEvent } from '../contributions/interfaces/contribution-event.interface';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly atClient: any;

  constructor(
    private readonly drizzleDbService: DrizzleDbService,
    private readonly configService: ConfigService,
  ) {
    // Initialise Africa's Talking client
    const AfricasTalking = require('africastalking');
    this.atClient = AfricasTalking({
      apiKey:   this.configService.get<string>('AT_API_KEY')!,
      username: this.configService.get<string>('AT_USERNAME')!,
    });
  }

  // ─── Send contribution confirmation ───────────────────
  // Called after every successful contribution
  async sendContributionConfirmation(
    event: ContributionEvent,
  ): Promise<void> {

    // Get member details
    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.id, event.memberId));

    if (!member || !member.phoneNumber) {
      this.logger.warn(
        `Member ${event.memberId} has no phone number. Skipping confirmation.`,
      );
      return;
    }

    // Get group details
    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, event.groupId));

    if (!group) {
      this.logger.warn(`Group ${event.groupId} not found. Skipping.`);
      return;
    }

    const message =
      `✅ AjoGuard: Your contribution of ₦${event.amount / 100} ` +
      `to "${group.name}" has been recorded.\n` +
      `Ref: ${event.eventId.slice(0, 8).toUpperCase()}\n` +
      `Date: ${new Date(event.receivedAt).toLocaleDateString()}`;

    await this.sendSms(member.phoneNumber, message);
  }

  // ─── Send missing payment alert to collector ──────────
  // Called when reconciliation finds missing payments
  async sendMissingPaymentAlert(
    groupId: string,
    missingMembers: Array<{
      memberName: string;
      phoneNumber: string | null;
      amountMissing: number;
    }>,
  ): Promise<void> {

    if (missingMembers.length === 0) return;

    // Find the collector for this group
    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.groupId, groupId),
          eq(members.role, 'COLLECTOR'),
          eq(members.status, 'ACTIVE'),
        ),
      );

    if (!collector || !collector.phoneNumber) {
      this.logger.warn(
        `No collector with phone number found for group ${groupId}`,
      );
      return;
    }

    // Get group name
    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    const missingNames = missingMembers
      .map((m) => m.memberName)
      .join(', ');

    const message =
      `⚠️ AjoGuard Alert - ${group?.name}:\n` +
      `${missingMembers.length} member(s) have not paid this cycle:\n` +
      `${missingNames}\n` +
      `Please follow up with them.`;

    await this.sendSms(collector.phoneNumber, message);

    // Also notify each missing member directly
    for (const missing of missingMembers) {
      if (!missing.phoneNumber) continue;

      const memberMessage =
        `⚠️ AjoGuard: You have a pending contribution of ` +
        `₦${missing.amountMissing / 100} for "${group?.name}".\n` +
        `Please pay as soon as possible.`;

      await this.sendSms(missing.phoneNumber, memberMessage);
    }
  }

  // ─── Send weekly group summary ────────────────────────
  // Called by the weekly scheduler
  async sendWeeklySummary(groupId: string): Promise<void> {

    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group || !group.isActive) return;

    // Get all active members
    const activeMembers = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.groupId, groupId),
          eq(members.status, 'ACTIVE'),
        ),
      );

    // Get all processed contributions
    const allContributions = await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(
        and(
          eq(contributions.groupId, groupId),
          eq(contributions.status, 'PROCESSED'),
        ),
      );

    const totalCollected = allContributions.reduce(
      (sum, c) => sum + c.amount,
      0,
    );

    const totalExpected = group.cycleAmount * group.totalMembers;

    // Find who is next in rotation
    const nextRecipient = activeMembers.find(
      (m) => m.payoutOrder === group.currentPosition,
    );

    const summary =
      `📊 AjoGuard Weekly Summary - ${group.name}:\n` +
      `Collected: ₦${totalCollected / 100} of ₦${totalExpected / 100}\n` +
      `Members: ${activeMembers.length}\n` +
      `Next payout: ${nextRecipient?.name ?? 'TBD'}\n` +
      `Stay consistent! 💪`;

    // Send summary to every active member with a phone number
    for (const member of activeMembers) {
      if (!member.phoneNumber) continue;
      await this.sendSms(member.phoneNumber, summary);
    }

    this.logger.log(
      `Weekly summary sent to ${activeMembers.length} members in group ${group.name}`,
    );
  }

  // ─── Core SMS sender ──────────────────────────────────
  // All notification methods funnel through here
  private async sendSms(
    phoneNumber: string,
    message: string,
  ): Promise<void> {

    try {
      const sms = this.atClient.SMS;

      await sms.send({
        to:   [phoneNumber],
        from: this.configService.get<string>('AT_SENDER_ID'),
        message,
      });

      // Log successful send
      await this.logNotification(phoneNumber, message, 'SENT');

      this.logger.log(
        `SMS sent to ${phoneNumber}: ${message.slice(0, 50)}...`,
      );

    } catch (error) {
      // Log failed send but do not throw
      // A failed notification should never fail the contribution
      await this.logNotification(
        phoneNumber,
        message,
        'FAILED',
        (error as Error).message,
      );

      this.logger.error(
        `Failed to send SMS to ${phoneNumber}: ${(error as Error).message}`,
      );
    }
  }

  // ─── Log notification to database ─────────────────────
  private async logNotification(
    recipient: string,
    message: string,
    status: string,
    failureReason?: string,
  ): Promise<void> {
    try {
      await this.drizzleDbService.db
        .insert(notificationLogs)
        .values({
          recipient,
          channel:   'SMS',
          message,
          status,
          attempts:  1,
          sentAt:    status === 'SENT' ? new Date() : null,
        });
    } catch (error) {
      // Never let logging failure break anything
      this.logger.error(
        `Failed to log notification: ${(error as Error).message}`,
      );
    }
  }

    @Cron(CronExpression.EVERY_WEEK)
    async runWeeklySummaries(): Promise<void> {
    this.logger.log('Running weekly summaries for all active groups');

    const allGroups = await this.drizzleDbService.db
        .select()
        .from(groups)
        .where(eq(groups.isActive, true));

    for (const group of allGroups) {
        await this.sendWeeklySummary(group.id);
    }

    this.logger.log('Weekly summaries complete');
    }
}