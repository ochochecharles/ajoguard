import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import {
  groups,
  members,
  contributions,
  reconciliationLogs,
  payouts,
} from '../db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly drizzleDbService: DrizzleDbService) {}

  // Main entry point
  async reconcileGroup(groupId: string): Promise<{
    status: string;
    missingMembers: any[];
    totalExpected: number;
    totalCollected: number;
  } | null> {
    this.logger.log(`Running reconciliation for group ${groupId}`);

    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group || !group.isActive) {
      this.logger.warn(`Group ${groupId} not found or inactive. Skipping.`);
      return null;
    }

    const cycleIdentifier = this.buildCycleIdentifier(
      group.cycleInterval,
      group.createdAt,
    );

    const activeMembers = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.groupId, groupId),
          eq(members.status, 'ACTIVE'),
          eq(members.role, 'MEMBER'),
        ),
      );

    if (activeMembers.length === 0) {
      this.logger.warn(`No active members in group ${groupId}. Skipping.`);
      return null;
    }

    const cycleContributions = await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(
        and(
          eq(contributions.groupId, groupId),
          eq(contributions.status, 'PROCESSED'),
        ),
      );

    const totalExpected = group.cycleAmount * activeMembers.length;
    const totalCollected = cycleContributions.reduce(
      (sum, c) => sum + c.amount,
      0,
    );

    const paidMemberIds = new Set(cycleContributions.map((c) => c.memberId));

    const missingMembers = activeMembers
      .filter((m) => !paidMemberIds.has(m.id))
      .map((m) => ({
        memberId: m.id,
        memberName: m.name,
        phoneNumber: m.phoneNumber,
        amountMissing: group.cycleAmount,
      }));

    const status = missingMembers.length === 0 ? 'HEALTHY' : 'DISCREPANCY';

    await this.saveReconciliationLog({
      groupId,
      cycleIdentifier,
      totalExpected,
      totalCollected,
      missingMembers,
      status,
    });

    await this.drizzleDbService.db
      .update(groups)
      .set({ totalMembers: activeMembers.length })
      .where(eq(groups.id, groupId));

    if (status === 'HEALTHY') {
      this.logger.log(
        `✅ Group ${group.name} is HEALTHY. ` +
          `Collected ₦${totalCollected / 100} of ₦${totalExpected / 100} expected.`,
      );
    } else {
      this.logger.warn(
        `⚠️ Group ${group.name} has DISCREPANCY. ` +
          `Collected ₦${totalCollected / 100} of ₦${totalExpected / 100}. ` +
          `${missingMembers.length} member(s) have not paid: ` +
          `${missingMembers.map((m) => m.memberName).join(', ')}`,
      );
    }

    // Return result so processor can pass missing members to notification service
    return {
      status,
      missingMembers,
      totalExpected,
      totalCollected,
    };
  }

  // Nightly scheduler
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runNightlyReconciliation(): Promise<void> {
    this.logger.log('Running nightly reconciliation for all active groups');

    const allGroups = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.isActive, true));

    this.logger.log(`Found ${allGroups.length} active groups to reconcile`);

    for (const group of allGroups) {
      await this.reconcileGroup(group.id);
    }

    this.logger.log('Nightly reconciliation complete');
  }

  // Record a payout
  async recordPayout(
    groupId: string,
    recipientId: string,
    recordedById: string,
  ): Promise<object> {
    return this.drizzleDbService.db.transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(groups)
        .where(eq(groups.id, groupId));

      if (!group) {
        throw new Error(`Group ${groupId} not found`);
      }

      const cycleIdentifier = this.buildCycleIdentifier(
        group.cycleInterval,
        group.createdAt,
      );
      const cycleStart = this.cycleStartDate(
        group.cycleInterval,
        group.createdAt,
      );

      // Only sum contributions received within the current cycle so the
      // payout amount does not accumulate across every cycle ever.
      const cycleContributions = await tx
        .select()
        .from(contributions)
        .where(
          and(
            eq(contributions.groupId, groupId),
            eq(contributions.status, 'PROCESSED'),
            gte(contributions.receivedAt, cycleStart),
          ),
        );

      // The pot equals what was collected this cycle, offset by anything
      // already paid out for the current cycle to other recipients.
      const cyclePayouts = await tx
        .select({ amount: payouts.amount })
        .from(payouts)
        .where(
          and(
            eq(payouts.groupId, groupId),
            eq(payouts.cycleIdentifier, cycleIdentifier),
          ),
        );

      const collectedThisCycle = cycleContributions.reduce(
        (sum, c) => sum + c.amount,
        0,
      );
      const alreadyPaidThisCycle = cyclePayouts.reduce(
        (sum, p) => sum + p.amount,
        0,
      );

      const payoutAmount = collectedThisCycle - alreadyPaidThisCycle;

      const [savedPayout] = await tx
        .insert(payouts)
        .values({
          groupId,
          recipientId,
          recordedById,
          amount: payoutAmount,
          cycleIdentifier,
          payoutDate: new Date(),
        })
        .returning();

      await tx
        .update(groups)
        .set({ currentPosition: group.currentPosition + 1 })
        .where(eq(groups.id, groupId));

      this.logger.log(
        `Payout of ₦${payoutAmount / 100} recorded for member ${recipientId}`,
      );

      return {
        message: 'Payout recorded successfully',
        payoutId: savedPayout.id,
        amount: savedPayout.amount / 100,
        amountInKobo: savedPayout.amount,
        cycleIdentifier: savedPayout.cycleIdentifier,
        payoutDate: savedPayout.payoutDate,
        nextPosition: group.currentPosition + 1,
      };
    });
  }

  // Get group summary
  async getGroupSummary(groupId: string) {
    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) throw new Error(`Group ${groupId} not found`);

    const activeMembers = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(and(eq(members.groupId, groupId), eq(members.status, 'ACTIVE')));

    const allContributions = await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(
        and(
          eq(contributions.groupId, groupId),
          eq(contributions.status, 'PROCESSED'),
        ),
      );

    const allPayouts = await this.drizzleDbService.db
      .select()
      .from(payouts)
      .where(eq(payouts.groupId, groupId));

    const totalCollectedEver = allContributions.reduce(
      (sum, c) => sum + c.amount,
      0,
    );

    const totalPaidOut = allPayouts.reduce((sum, p) => sum + p.amount, 0);

    return {
      groupName: group.name,
      cycleInterval: group.cycleInterval,
      cycleAmount: group.cycleAmount / 100,
      cycleAmountInKobo: group.cycleAmount,
      totalMembers: activeMembers.length,
      currentPosition: group.currentPosition,
      totalCollectedEver: totalCollectedEver / 100,
      totalCollectedEverInKobo: totalCollectedEver,
      totalPaidOut: totalPaidOut / 100,
      totalPaidOutInKobo: totalPaidOut,
      balance: (totalCollectedEver - totalPaidOut) / 100,
      balanceInKobo: totalCollectedEver - totalPaidOut,
      members: activeMembers.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        payoutOrder: m.payoutOrder,
        contributionCount: allContributions.filter((c) => c.memberId === m.id)
          .length,
        totalContributed:
          allContributions
            .filter((c) => c.memberId === m.id)
            .reduce((sum, c) => sum + c.amount, 0) / 100,
        totalContributedInKobo: allContributions
          .filter((c) => c.memberId === m.id)
          .reduce((sum, c) => sum + c.amount, 0),
        hasReceivedPayout: allPayouts.some((p) => p.recipientId === m.id),
      })),
    };
  }

  // Helper: Build cycle identifier for the cycle containing `anchor`
  private buildCycleIdentifier(
    cycleInterval: string,
    anchor: Date = new Date(),
  ): string {
    const start = this.cycleStartDate(cycleInterval, anchor);
    const year = start.getUTCFullYear();

    if (cycleInterval === 'weekly') {
      // ISO 8601 week number computed in UTC.
      const startOfYear = new Date(Date.UTC(year, 0, 1));
      const weekNumber = Math.ceil(
        ((start.getTime() - startOfYear.getTime()) / 86400000 +
          startOfYear.getUTCDay() +
          1) /
          7,
      );
      return `${year}-W${String(weekNumber).padStart(2, '0')}`;
    }

    const month = String(start.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  // Helper: Start timestamp of the cycle that contains `now`,
  // anchored to when the group was created so cycles line up.
  // All math is done in UTC so cycle boundaries never shift by host TZ.
  private cycleStartDate(
    cycleInterval: string,
    anchor: Date = new Date(),
  ): Date {
    const now = new Date();

    if (cycleInterval === 'weekly') {
      const dayMs = 24 * 60 * 60 * 1000;
      const cyclesElapsed = Math.floor(
        (now.getTime() - anchor.getTime()) / (7 * dayMs),
      );
      return new Date(anchor.getTime() + cyclesElapsed * 7 * dayMs);
    }

    // monthly: same UTC day-of-month the group was created, in the current cycle
    const monthsElapsed =
      (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - anchor.getUTCMonth());
    return new Date(
      Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth() + monthsElapsed,
        anchor.getUTCDate(),
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
      ),
    );
  }

  // Helper: Save reconciliation log
  private async saveReconciliationLog(data: {
    groupId: string;
    cycleIdentifier: string;
    totalExpected: number;
    totalCollected: number;
    missingMembers: any[];
    status: 'HEALTHY' | 'DISCREPANCY';
  }): Promise<void> {
    await this.drizzleDbService.db.insert(reconciliationLogs).values({
      groupId: data.groupId,
      cycleIdentifier: data.cycleIdentifier,
      totalExpected: data.totalExpected,
      totalCollected: data.totalCollected,
      missingMembers: data.missingMembers,
      status: data.status,
      checkedAt: new Date(),
    });
  }
}
