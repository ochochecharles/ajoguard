import {
  Controller,
  Get,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

@ApiTags('contributions')
@UseGuards(JwtAuthGuard)
@Controller('contributions')
export class ContributionsController {
  constructor(
    private readonly contributionsService: ContributionsService,
  ) {}

  // GET /contributions/group/:groupId
  @ApiOperation({ summary: 'Get all contributions belonging to a specific group' })
  @Get('group/:groupId')
  findByGroup(@Param('groupId') groupId: string, @Req() req: any) {
  if (groupId !== req.user.groupId) {
      throw new ForbiddenException(
        'You can only view contributions for your own group',
      );
    }  
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