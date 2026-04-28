import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  // POST /groups
  @ApiOperation({ summary: 'Create a new savings group' })
  @Post()
  create(@Body() dto: CreateGroupDto) {
    // Convert cycleAmount from Naira to Kobo
    const normalisedDto = {
      ...dto,
      cycleAmount: dto.cycleAmount * 100,
    };
  return this.groupsService.create(normalisedDto);
  }

  // GET /groups
  @ApiOperation({ summary: 'Get all savings groups' })
  @Get()
  findAll() {
    return this.groupsService.findAll();
  }

  // GET /groups/:id
  @ApiOperation({ summary: 'Get a single group by ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groupsService.findOne(id);
  }

  // PATCH /groups/:id/deactivate
  @ApiOperation({ summary: 'Deactivate a group' })
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.groupsService.deactivate(id);
  }
}