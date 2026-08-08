import { Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { CreateGroupDto } from './dto/create-group.dto';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { groups } from '../db/schema';
import { eq, count, desc } from 'drizzle-orm';

@Injectable()
export class GroupsService {
  constructor(private readonly drizzleDbService: DrizzleDbService) {}

  // Create a new group
  async create(dto: CreateGroupDto) {
    const [group] = await this.drizzleDbService.db
      .insert(groups)
      .values({
        name: dto.name,
        joinCode: this.generateJoinCode(),
        description: dto.description,
        cycleAmount: dto.cycleAmount,
        cycleInterval: dto.cycleInterval,
      })
      .returning(); // returns the full created row

    return this.toPublicGroup(group);
  }

  private generateJoinCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[randomInt(chars.length)];
    }
    return code;
  }

  // Get all groups
  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    const [total] = await this.drizzleDbService.db
      .select({ count: count() })
      .from(groups);

    const all = await this.drizzleDbService.db
      .select()
      .from(groups)
      .orderBy(desc(groups.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: all.map((group) => this.toPublicGroup(group)),
      page,
      limit,
      total: total?.count ?? 0,
      totalPages: Math.ceil((total?.count ?? 0) / limit),
    };
  }

  // Get a single group by ID
  async findOne(id: string) {
    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, id));

    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    return this.toPublicGroup(group);
  }

  // Get a single group's join code
  async getJoinCode(id: string) {
    const [group] = await this.drizzleDbService.db
      .select({ joinCode: groups.joinCode })
      .from(groups)
      .where(eq(groups.id, id));

    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    return group;
  }

  // Deactivate a group (we never hard delete)
  async deactivate(id: string) {
    await this.findOne(id); // throws if not found

    const [updated] = await this.drizzleDbService.db
      .update(groups)
      .set({ isActive: false })
      .where(eq(groups.id, id))
      .returning();

    return this.toPublicGroup(updated);
  }

  // Strips internal/sensitive columns (e.g. joinCode) before returning
  // and projects money to the public convention: Naira + ...InKobo raw.
  private toPublicGroup(group: typeof groups.$inferSelect) {
    const { joinCode, cycleAmount, ...rest } = group;
    return {
      ...rest,
      cycleAmount: cycleAmount / 100,
      cycleAmountInKobo: cycleAmount,
    };
  }
}
