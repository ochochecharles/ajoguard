import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { auditLogs } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ContributionEvent } from '../contributions/interfaces/contribution-event.interface';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly HMAC_SECRET: string;

  constructor(
    private readonly drizzleDbService: DrizzleDbService,
    private readonly configService: ConfigService,
  ) {
    const secret = this.configService.get<string>('AUDIT_HMAC_SECRET');

    if (!secret) {
      throw new Error(
        'AUDIT_HMAC_SECRET is not defined in your environment variables. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }

    this.HMAC_SECRET = secret;
  }

  // Main entry point
  // Called by the processor after every contribution
  async writeAuditLog(event: ContributionEvent): Promise<void> {
    this.logger.log(`Writing audit log for event ${event.eventId}`);

    const previousEntry = await this.getLastEntry(event.groupId);

    // Determine prevHash and sequenceNum
    const prevHash = previousEntry
      ? previousEntry.entryHash
      : '0'.repeat(64); // genesis entry for a new group

    const sequenceNum = previousEntry
      ? previousEntry.sequenceNum + 1
      : 1;

    // Build the entry data
    // This is the full snapshot of the event at this point in time
    const entryData = {
      eventId:     event.eventId,
      groupId:     event.groupId,
      memberId:    event.memberId,
      collectorId: event.collectorId,
      amount:      event.amount,
      channel:     event.channel,
      receivedAt:  event.receivedAt,
      sequenceNum,
    };

    // Compute the entry hash
    const entryHash = createHash('sha256')
      .update(prevHash + JSON.stringify(entryData))
      .digest('hex');

    // Compute the HMAC signature
    // Proves this entry was written by YOUR server
    const hmacSig = createHmac('sha256', this.HMAC_SECRET)
      .update(entryHash)
      .digest('hex');

    // Write to database
    await this.drizzleDbService.db
      .insert(auditLogs)
      .values({
        eventId:     event.eventId,
        groupId:     event.groupId,
        sequenceNum,
        entryData,
        prevHash,
        entryHash,
        hmacSig,
        createdAt:   new Date(),
      });

    this.logger.log(
      `✅ Audit log written. Group: ${event.groupId} ` +
      `Sequence: ${sequenceNum} Hash: ${entryHash.slice(0, 16)}...`,
    );
  }

  // Verify the full audit chain for a group
  // Walks every entry in order and checks integrity
  async verifyChain(groupId: string): Promise<{
    valid: boolean;
    totalEntries: number;
    brokenAt?: number;
    reason?: string;
  }> {
    this.logger.log(`Verifying audit chain for group ${groupId}`);

    // Get all entries in sequence order
    const entries = await this.drizzleDbService.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.groupId, groupId))
      .orderBy(auditLogs.sequenceNum);

    if (entries.length === 0) {
      return { valid: true, totalEntries: 0 };
    }

    let expectedPrevHash = '0'.repeat(64);

    for (const entry of entries) {

      // Check 1: Does the stored prevHash match what we expect?
      if (entry.prevHash !== expectedPrevHash) {
        this.logger.error(
          `Chain broken at sequence ${entry.sequenceNum} — prevHash mismatch`,
        );
        return {
          valid: false,
          totalEntries: entries.length,
          brokenAt: entry.sequenceNum,
          reason: 'BROKEN_CHAIN — prevHash does not match previous entry hash',
        };
      }

      // Check 2: Recompute the entry hash and verify it matches
      const recomputedHash = createHash('sha256')
        .update(entry.prevHash + JSON.stringify(entry.entryData))
        .digest('hex');

      if (recomputedHash !== entry.entryHash) {
        this.logger.error(
          `Chain broken at sequence ${entry.sequenceNum} — hash mismatch`,
        );
        return {
          valid: false,
          totalEntries: entries.length,
          brokenAt: entry.sequenceNum,
          reason: 'HASH_MISMATCH — entry data was modified after writing',
        };
      }

      // Check 3: Verify the HMAC signature
      const recomputedHmac = createHmac('sha256', this.HMAC_SECRET)
        .update(entry.entryHash)
        .digest('hex');

      if (recomputedHmac !== entry.hmacSig) {
        this.logger.error(
          `Chain broken at sequence ${entry.sequenceNum} — invalid signature`,
        );
        return {
          valid: false,
          totalEntries: entries.length,
          brokenAt: entry.sequenceNum,
          reason: 'INVALID_SIGNATURE — entry was not written by this server',
        };
      }

      // Move to next entry
      expectedPrevHash = entry.entryHash;
    }

    this.logger.log(
      `✅ Audit chain valid. ${entries.length} entries verified.`,
    );

    return {
      valid: true,
      totalEntries: entries.length,
    };
  }

  // Get audit history for a group
  async getAuditHistory(groupId: string) {
    const entries = await this.drizzleDbService.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.groupId, groupId))
      .orderBy(desc(auditLogs.sequenceNum));

    return entries.map((entry) => ({
      sequenceNum:  entry.sequenceNum,
      eventId:      entry.eventId,
      entryData:    entry.entryData,
      entryHash:    entry.entryHash.slice(0, 16) + '...', // truncate for display
      createdAt:    entry.createdAt,
    }));
  }

  // Helper: Get last entry for a group
  private async getLastEntry(groupId: string) {
    const [lastEntry] = await this.drizzleDbService.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.groupId, groupId))
      .orderBy(desc(auditLogs.sequenceNum))
      .limit(1);

    return lastEntry ?? null;
  }
}