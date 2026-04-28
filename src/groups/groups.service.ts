import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { groups } from '../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class GroupsService {
    constructor(private readonly drizzleDbService: DrizzleDbService) {}

  // Create a new group
  async create(dto: CreateGroupDto) {
    const [group] = await this.drizzleDbService.db
      .insert(groups)
      .values({
        name: dto.name,
        description: dto.description,
        cycleAmount: dto.cycleAmount,
        cycleInterval: dto.cycleInterval,
      })
      .returning(); // returns the full created row

    return group;
  }

  // Get all groups
  async findAll() {
    return await this.drizzleDbService.db.select().from(groups);
  }

  // Get a single group by ID
  async findOne(id: string) {
    const [group] = await this.drizzleDbService.db.select()
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

    return updated;
  }
}