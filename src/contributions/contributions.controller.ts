import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('contributions')
@Controller('contributions')
export class ContributionsController {
  constructor(
    private readonly contributionsService: ContributionsService,
  ) {}

  // GET /contributions/group/:groupId
  @ApiOperation({ summary: 'Get all contributions belonging to a specific group' })
  @Get('group/:groupId')
  findByGroup(@Param('groupId') groupId: string) {
    return this.contributionsService.findByGroup(groupId);
  }

  // GET /contributions/member/:memberId
  @ApiOperation({ summary: 'Get all contributions for a specific member' })
  @Get('member/:memberId')
  findByMember(@Param('memberId') memberId: string) {
    return this.contributionsService.findByMember(memberId);
  }

  // GET /contributions/:id
  @ApiOperation({ summary: 'Get a specific contribution by ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contributionsService.findOne(id);
  }
}