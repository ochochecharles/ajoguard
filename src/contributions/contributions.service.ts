import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { contributions, members, groups } from '../db/schema';
import { eq } from 'drizzle-orm';
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
  async findByGroup(groupId: string) {
    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    return await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(eq(contributions.groupId, groupId));
  }

  // Get all contributions for a specific member
  async findByMember(memberId: string) {
    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.id, memberId));

    if (!member) {
      throw new NotFoundException(`Member with ID ${memberId} not found`);
    }

    return await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(eq(contributions.memberId, memberId));
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

    return contribution;
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
}