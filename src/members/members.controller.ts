import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

@ApiTags('members')
@UseGuards(JwtAuthGuard)
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
  findByGroup(@Param('groupId') groupId: string, @Req() req: any) {
    if (groupId !== req.user.groupId) {
      throw new ForbiddenException(
        'You can only view members of your own group',
      );
    }
    return this.membersService.findByGroup(groupId);
  }

  // GET /members/:id
  @ApiOperation({ summary: 'Get a single member from a specific group' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.membersService.findOne(id);
  }

  // PATCH /members/:id/deactivate
  @ApiOperation({ summary: 'Deactivate a member of a group' })
@UseGuards(JwtAuthGuard)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.membersService.deactivate(id);
  }
}