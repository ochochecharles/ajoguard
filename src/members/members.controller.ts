import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { RolesGuard, Roles } from 'src/auth/roles.guard';
import { PaginationDto } from 'src/common/dto/pagination.dto';

@ApiTags('members')
@UseGuards(JwtAuthGuard)
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  // POST /members
  @ApiOperation({ summary: 'Create a new member in a group' })
  @UseGuards(RolesGuard)
  @Roles('COLLECTOR')
  @Post()
  create(@Body() dto: CreateMemberDto) {
    return this.membersService.create(dto);
  }

  // Get all members belonging to a specific group
  @ApiOperation({ summary: 'Get all members belonging to a specific group' })
  @Get('group/:groupId')
  findByGroup(
    @Param('groupId') groupId: string,
    @Query() pagination: PaginationDto,
    @Req() req: any,
  ) {
    if (groupId !== req.user.groupId) {
      throw new ForbiddenException(
        'You can only view members of your own group',
      );
    }
    return this.membersService.findByGroup(
      groupId,
      pagination.page,
      pagination.limit,
    );
  }

  // GET /members/:id
  @ApiOperation({ summary: 'Get a single member from a specific group' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const memberGroupId = await this.membersService.findMemberGroupId(id);
    if (memberGroupId !== req.user.groupId) {
      throw new ForbiddenException(
        'You can only view members of your own group',
      );
    }
    return this.membersService.findOne(id);
  }

  // PATCH /members/:id/deactivate
  @ApiOperation({ summary: 'Deactivate a member of a group' })
  @UseGuards(RolesGuard)
  @Roles('COLLECTOR')
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.membersService.deactivate(id);
  }
}
