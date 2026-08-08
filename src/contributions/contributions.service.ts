import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { contributions, members, groups } from '../db/schema';
import { eq, count, desc } from 'drizzle-orm';
import { ContributionEvent } from './interfaces/contribution-event.interface';

@Injectable()
export class ContributionsService {
  constructor(private readonly drizzleDbService: DrizzleDbService) {}

  // Save a contribution event to the database
  async save(event: ContributionEvent) {
    const [contribution] = await this.drizzleDbService.db
      .insert(contributions)
      .values({
        id: event.eventId,
        amount: event.amount,
        channel: event.channel,
        status: 'PENDING',
        idempotencyKey: event.idempotencyKey,
        rawPayload: event.rawPayload,
        memberId: event.memberId,
        collectorId: event.collectorId,
        groupId: event.groupId,
        receivedAt: event.receivedAt,
      })
      .returning();

    return contribution;
  }

  // Get all contributions for a group
  async findByGroup(groupId: string, page = 1, limit = 50) {
    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    const offset = (page - 1) * limit;

    const [total] = await this.drizzleDbService.db
      .select({ count: count() })
      .from(contributions)
      .where(eq(contributions.groupId, groupId));

    const items = (await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(eq(contributions.groupId, groupId))
      .orderBy(desc(contributions.receivedAt))
      .limit(limit)
      .offset(offset)).map((c) => this.toPublicContribution(c));

    return {
      data: items,
      page,
      limit,
      total: total?.count ?? 0,
      totalPages: Math.ceil((total?.count ?? 0) / limit),
    };
  }

  // Resolve the groupId that owns a member (for access-control checks)
  async findMemberGroupId(memberId: string) {
    const [member] = await this.drizzleDbService.db
      .select({ groupId: members.groupId })
      .from(members)
      .where(eq(members.id, memberId));

    if (!member) {
      throw new NotFoundException(`Member with ID ${memberId} not found`);
    }

    return member.groupId;
  }

  // Resolve the groupId that owns a contribution (for access-control checks)
  async findContributionGroupId(contributionId: string) {
    const [contribution] = await this.drizzleDbService.db
      .select({ groupId: contributions.groupId })
      .from(contributions)
      .where(eq(contributions.id, contributionId));

    if (!contribution) {
      throw new NotFoundException(
        `Contribution with ID ${contributionId} not found`,
      );
    }

    return contribution.groupId;
  }

  // Get all contributions for a member
  async findByMember(memberId: string, page = 1, limit = 50) {
    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.id, memberId));

    if (!member) {
      throw new NotFoundException(`Member with ID ${memberId} not found`);
    }

    const offset = (page - 1) * limit;

    const [total] = await this.drizzleDbService.db
      .select({ count: count() })
      .from(contributions)
      .where(eq(contributions.memberId, memberId));

    const items = (await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(eq(contributions.memberId, memberId))
      .orderBy(desc(contributions.receivedAt))
      .limit(limit)
      .offset(offset)).map((c) => this.toPublicContribution(c));

    return {
      data: items,
      page,
      limit,
      total: total?.count ?? 0,
      totalPages: Math.ceil((total?.count ?? 0) / limit),
    };
  }

  // Get a single contribution by ID
  async findOne(id: string) {
    const [contribution] = await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(eq(contributions.id, id));

    if (!contribution) {
      throw new NotFoundException(`Contribution with ID ${id} not found`);
    }

    return this.toPublicContribution(contribution);
  }

  // Update contribution status after queue processes it
  async updateStatus(
    id: string,
    status: 'PROCESSED' | 'FAILED',
    failureReason?: string,
  ) {
    const [updated] = await this.drizzleDbService.db
      .update(contributions)
      .set({
        status,
        failureReason: failureReason ?? null,
        processedAt: new Date(),
      })
      .where(eq(contributions.id, id))
      .returning();

    return updated;
  }

  // Strips internal columns (rawPayload, idempotencyKey, failureReason) before returning
  // and projects money to the public convention: Naira + ...InKobo raw.
  private toPublicContribution(
    contribution: typeof contributions.$inferSelect,
  ) {
    const {
      rawPayload,
      idempotencyKey,
      failureReason,
      amount,
      ...publicPart
    } = contribution;
    return {
      ...publicPart,
      amount: amount / 100,
      amountInKobo: amount,
    };
  }
}
