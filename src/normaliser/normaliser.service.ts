import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { normalisePhoneNumber } from '../utils/phone.util';
import { randomUUID, createHash } from 'crypto';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { ContributionsService } from '../contributions/contributions.service';
import { ContributionEvent } from '../contributions/interfaces/contribution-event.interface';
import { CreateContributionDto } from '../contributions/dto/create-contribution.dto';
import { groups, members, contributions } from '../db/schema';


/**
 * NormaliserService — the security checkpoint of the AjoGuard ingestion pipeline.
 *
 * Every contribution entering the system — regardless of which channel it came
 * from (web form, SMS, or WhatsApp) — must pass through this service before
 * it is saved to the database or queued for processing.
 *
 * The normaliser enforces five sequential steps:
 *   1. Resolve     — verify all referenced entities exist in the database
 *   2. Validate    — enforce the group's business rules
 *   3. Build key   — generate a unique fingerprint for deduplication
 *   4. Deduplicate — reject if this exact transaction was already recorded
 *   5. Save & Queue — persist the record and push to background processor
 *
 * Design principle: this service is intentionally channel-agnostic.
 * It receives a CreateContributionDto regardless of whether the data
 * originated from a web form, an SMS parser, or a WhatsApp parser.
 * The channel adapters in IngestController handle translation;
 * this service handles validation and persistence.
 */
@Injectable()
export class NormaliserService {
    private readonly logger = new Logger(NormaliserService.name);
  
  constructor(
    private readonly drizzleDbService: DrizzleDbService,
    private readonly contributionsService: ContributionsService,

    /**
     * BullMQ queue for background processing.
     * After a contribution is saved, a job is pushed here so the
     * ContributionProcessor can run reconciliation, write the audit log,
     * and send notifications asynchronously — without making the caller wait.
     */
    @InjectQueue('contributions') private readonly contributionQueue: Queue,
  ) {}
  
// normalise method — the main entry point for all contribution data
  async normalise(
    dto: CreateContributionDto,
    rawPayload: string,
  ): Promise<ContributionEvent> {

    const { group, member, collector } = await this.resolve(dto);

    await this.validate(dto, group, member, collector);

    const idempotencyKey = this.buildIdempotencyKey(dto);

    await this.deduplicate(idempotencyKey);

    // Build the internal ContributionEvent shape.
    // This is the canonical format used by all downstream systems
    // (processor, reconciliation engine, audit log writer).
    const event: ContributionEvent = {
      eventId:        randomUUID(),   
      groupId:        dto.groupId,
      memberId:       dto.memberId,
      collectorId:    dto.collectorId,
      amount:         dto.amount,     
      channel:        dto.channel,
      rawPayload,                     
      idempotencyKey,
      receivedAt:     new Date(),    
    };

    // Persist to database with status PENDING.
    // Status advances to PROCESSED or FAILED by the queue worker.
    await this.contributionsService.save(event);

    // Push to Redis queue for background processing.
    // jobId is set to the idempotencyKey as a second deduplication layer —
    // BullMQ will reject a job with the same jobId that already exists in
    // the queue, preventing duplicate background processing even if this
    // method is somehow called twice for the same contribution.
    await this.contributionQueue.add(
      'process-contribution', // job name — what type of job is this
      event,                  // job data — the actual payload
      {
        jobId: event.idempotencyKey,
      },
    );

    return event;
  }

  // resolve helper method
  private async resolve(dto: CreateContributionDto) {

    // ── Group verification

    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, dto.groupId));

    if (!group) {
      throw new NotFoundException(
        `Group with ID ${dto.groupId} not found`,
      );
    }

    if (!group.isActive) {
      throw new BadRequestException(
        `Group ${group.name} is no longer active`,
      );
    }

    // ── Member verification
    // This prevents a valid member from another group being used here —
    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.id, dto.memberId),
          eq(members.groupId, dto.groupId),
        ),
      );

    if (!member) {
      throw new NotFoundException(
        `Member with ID ${dto.memberId} not found in this group`,
      );
    }

    if (member.status === 'INACTIVE') {
      throw new BadRequestException(
        `Member ${member.name} is inactive and cannot make contributions`,
      );
    }

    // ── Collector verification
    // Same combined ID + groupId check as member verification above.
    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.id, dto.collectorId),
          eq(members.groupId, dto.groupId),
        ),
      );

    if (!collector) {
      throw new NotFoundException(
        `Collector with ID ${dto.collectorId} not found in this group`,
      );
    }

    // This prevents self-reporting fraud where a member logs their own payment
    // without the designated collector's involvement.
    if (collector.role !== 'COLLECTOR') {
      throw new BadRequestException(
        `Member ${collector.name} is not authorised to log contributions`,
      );
    }

    // Normalise phone numbers to E.164 format before returning.
// This ensures notification service always receives a valid format
// regardless of how the number was originally stored in the database.
if (member.phoneNumber) {
  try {
    member.phoneNumber = normalisePhoneNumber(member.phoneNumber);
  } catch {
    // Log but do not block the contribution if normalisation fails.
    // The contribution record is more important than the notification.
    this.logger.warn(
      `Could not normalise member phone number: ${member.phoneNumber}`,
    );
  }
}

if (collector.phoneNumber) {
  try {
    collector.phoneNumber = normalisePhoneNumber(collector.phoneNumber);
  } catch {
    this.logger.warn(
      `Could not normalise collector phone number: ${collector.phoneNumber}`,
    );
  }
}

    return { group, member, collector };
  }

  // validate helper method
  private async validate(
    dto: CreateContributionDto,
    group: any,
    member: any,
    collector: any,
  ) {

    // ── Amount validation
    if (dto.amount !== group.cycleAmount) {
      throw new BadRequestException(
        `Invalid amount. Expected ₦${group.cycleAmount / 100} (${group.cycleAmount} kobo) but received ${dto.amount / 100} kobo (₦${dto.amount})`,
      );
    }

    // ── Self-logging prevention
    // A member cannot be both the payer and the collector in the same
    // contribution record.
    // Allowing self-logging would let a member claim they paid without
    // actually handing money to anyone.
    if (dto.memberId === dto.collectorId) {
      throw new BadRequestException(
        `A member cannot log their own contribution. A separate collector must record it`,
      );
    }
  }

  // buildIdempotencyKey helper method
  private buildIdempotencyKey(dto: CreateContributionDto): string {

    const timeWindow = Math.floor(Date.now() / 1000 / 60);
    const raw = `${dto.collectorId}:${dto.memberId}:${dto.amount}:${timeWindow}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  // deduplicate helper method
  private async deduplicate(idempotencyKey: string) {
    try {
      const existing = await this.drizzleDbService.db
        .select()
        .from(contributions)
        .where(eq(contributions.idempotencyKey, idempotencyKey));

      if (existing.length > 0) {
        throw new ConflictException(
          `Duplicate detected. This exact contribution was already recorded within the last 60 seconds. If this is a new payment, please wait a moment and try again`,
        );
      }
    } catch (error) {
      // Re-throw both ConflictException (our expected case) and any
      // unexpected errors (database connection issues etc).
      // We do not swallow errors here — all failures bubble up to the caller.
      if (error instanceof ConflictException) throw error;
      throw error;
    }
  }
}