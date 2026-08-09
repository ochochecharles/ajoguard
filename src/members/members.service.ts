import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, count } from 'drizzle-orm';
import { normalisePhoneNumber } from '../utils/phone.util';
import { CreateMemberDto } from './dto/create-member.dto';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { members, groups } from '../db/schema';

@Injectable()
export class MembersService {
  constructor(private readonly drizzleDbService: DrizzleDbService) {}

  // Create a new member
  async create(dto: CreateMemberDto) {
    // First verify the group exists before adding a member to it
    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, dto.groupId));

    if (!group) {
      throw new NotFoundException(`Group with ID ${dto.groupId} not found`);
    }

    if (!group.isActive) {
      throw new BadRequestException(`Cannot add members to an inactive group`);
    }

    // Normalise phone number to E.164 format before saving.
    // This ensures all phone numbers in the database are consistent
    // regardless of what format the caller provided.
    let normalisedPhone: string | undefined = undefined;

    if (dto.phoneNumber) {
      try {
        normalisedPhone = normalisePhoneNumber(dto.phoneNumber);
      } catch (error) {
        throw new BadRequestException(
          `Invalid phone number: ${(error as Error).message}`,
        );
      }
    }

    // Create the member
    const [member] = await this.drizzleDbService.db
      .insert(members)
      .values({
        name: dto.name,
        phoneNumber: normalisedPhone,
        email: dto.email,
        groupId: dto.groupId,
        role: dto.role ?? 'MEMBER',
      })
      .returning();

    return this.toPublicMember(member);
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

  // Get all members in a group
  async findByGroup(groupId: string, page = 1, limit = 50) {
    // Verify group exists first
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
      .from(members)
      .where(eq(members.groupId, groupId));

    const items = (await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.groupId, groupId))
      .limit(limit)
      .offset(offset)).map((m) => this.toPublicMember(m));

    return {
      data: items,
      page,
      limit,
      total: total?.count ?? 0,
      totalPages: Math.ceil((total?.count ?? 0) / limit),
    };
  }

  // Get a single member by ID
  async findOne(id: string) {
    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.id, id));

    if (!member) {
      throw new NotFoundException(`Member with ID ${id} not found`);
    }

    return this.toPublicMember(member);
  }

  // Deactivate a member (never hard delete)
  async deactivate(id: string) {
    await this.findOne(id);

    const [updated] = await this.drizzleDbService.db
      .update(members)
      .set({ status: 'INACTIVE' })
      .where(eq(members.id, id))
      .returning();

    return this.toPublicMember(updated);
  }

  // Strips internal columns (telegramUserId) before returning
  private toPublicMember(member: typeof members.$inferSelect) {
    const { telegramUserId, ...publicMember } = member;
    return { ...publicMember, isTelegramLinked: telegramUserId != null };
  }
}
