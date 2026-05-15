import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
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
      throw new NotFoundException(
        `Group with ID ${dto.groupId} not found`
      );
    }

    if (!group.isActive) {
      throw new BadRequestException(
        `Cannot add members to an inactive group`
      );
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
        groupId: dto.groupId,
        role: dto.role ?? 'MEMBER',
      })
      .returning();

    return member;
  }

  // Get all members in a group
  async findByGroup(groupId: string) {

    // Verify group exists first
    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    return await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.groupId, groupId));
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

    return member;
  }

  // Deactivate a member (never hard delete)
  async deactivate(id: string) {
    await this.findOne(id);

    const [updated] = await this.drizzleDbService.db
      .update(members)
      .set({ status: 'INACTIVE' })
      .where(eq(members.id, id))
      .returning();

    return updated;
  }
}