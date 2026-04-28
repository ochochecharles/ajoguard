import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { ContributionsService } from '../contributions/contributions.service';
import { ContributionEvent } from '../contributions/interfaces/contribution-event.interface';
import { CreateContributionDto } from '../contributions/dto/create-contribution.dto';
import { groups, members, contributions } from '../db/schema';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class NormaliserService {
  constructor(
    private readonly drizzleDbService: DrizzleDbService,
    private readonly contributionsService: ContributionsService,
  ) {}

  // ─── Main entry point ─────────────────────────────────
  // Every channel calls this one method
  async normalise(
    dto: CreateContributionDto,
    rawPayload: string,
  ): Promise<ContributionEvent> {

    // Resolve
    const { group, member, collector } = await this.resolve(dto);

    // Validate
    await this.validate(dto, group, member, collector);

    // Build idempotency key — fingerprint for deduplication
    const idempotencyKey = this.buildIdempotencyKey(dto);

    // Deduplicate — reject if already recorded
    await this.deduplicate(idempotencyKey);

    // Build and save the ContributionEvent
    const event: ContributionEvent = {
      eventId: randomUUID(),
      groupId: dto.groupId,
      memberId: dto.memberId,
      collectorId: dto.collectorId,
      amount: dto.amount,
      channel: dto.channel,
      rawPayload,
      idempotencyKey,
      receivedAt: new Date(),
    };
    await this.contributionsService.save(event);

    return event;
  }

  // This function is responsible for verifying everything exists in the database
  private async resolve(dto: CreateContributionDto) {

    // Verify group exists and is active
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

    // Verify member exists and belongs to this group
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

    // Verify collector exists, belongs to this group, and has COLLECTOR role
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

    if (collector.role !== 'COLLECTOR') {
      throw new BadRequestException(
        `Member ${collector.name} is not authorised to log contributions`,
      );
    }

    return { group, member, collector };
  }

  // Validate function checks business rules
  private async validate(
    dto: CreateContributionDto,
    group: any,
    member: any,
    collector: any,
  ) {

    // Amount must match the group's cycle amount exactly
    if (dto.amount !== group.cycleAmount) {
      throw new BadRequestException(
        `Invalid amount. Expected ₦${group.cycleAmount / 100} (${group.cycleAmount} kobo) but received ${dto.amount / 100} kobo (₦${dto.amount})`,
      );
    }

    // Member cannot log their own contribution
    // A collector must be a different person from the member paying
    if (dto.memberId === dto.collectorId) {
      throw new BadRequestException(
        `A member cannot log their own contribution. A separate collector must record it`,
      );
    }
  }

  // ─── Build idempotency key ───────────────────
  private buildIdempotencyKey(dto: CreateContributionDto): string {

    // We hash: collectorId + memberId + amount + current time window
    // Time window = current Unix timestamp rounded down to nearest 60 seconds
    // This means the same payment within 60 seconds = duplicate
    // The same payment 61 seconds later = new legitimate payment
    const timeWindow = Math.floor(Date.now() / 1000 / 60);

    const raw = `${dto.collectorId}:${dto.memberId}:${dto.amount}:${timeWindow}`;

    return createHash('sha256').update(raw).digest('hex');
  }

  // ─── Deduplicate ──────────────────────────────
  private async deduplicate(idempotencyKey: string) {
    try {
      // contributionsService.save() will throw ConflictException if key exists
      // We check here first for a cleaner error message
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
      if (error instanceof ConflictException) throw error;
      throw error;
    }
  }
}