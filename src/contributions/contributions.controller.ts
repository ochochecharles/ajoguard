import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('contributions')
@Controller('contributions')
export class ContributionsController {
  constructor(
    private readonly contributionsService: ContributionsService,
  ) {}

  // GET /contributions/group/:groupId
  @Get('group/:groupId')
  findByGroup(@Param('groupId') groupId: string) {
    return this.contributionsService.findByGroup(groupId);
  }

  // GET /contributions/member/:memberId
  @Get('member/:memberId')
  findByMember(@Param('memberId') memberId: string) {
    return this.contributionsService.findByMember(memberId);
  }

  // GET /contributions/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contributionsService.findOne(id);
  }
}