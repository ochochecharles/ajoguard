import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  // POST /members
  @ApiOperation({ summary: 'Create a new member in a group' })
  @Post()
  create(@Body() dto: CreateMemberDto) {
    return this.membersService.create(dto);
  }

  // Get all members belonging to a specific group
  @ApiOperation({ summary: 'Get all members belonging to a specific group' })
  @Get('group/:groupId')
  findByGroup(@Param('groupId') groupId: string) {
    return this.membersService.findByGroup(groupId);
  }

  // GET /members/:id
  @ApiOperation({ summary: 'Get a single member from a specific group' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.membersService.findOne(id);
  }

  // PATCH /members/:id/deactivate
  @ApiOperation({ summary: 'Deactivate a member of a group' })
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.membersService.deactivate(id);
  }
}