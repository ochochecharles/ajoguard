import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { PaginationDto } from 'src/common/dto/pagination.dto';

@ApiTags('contributions')
@UseGuards(JwtAuthGuard)
@Controller('contributions')
export class ContributionsController {
  constructor(private readonly contributionsService: ContributionsService) {}

  // GET /contributions/group/:groupId
  @ApiOperation({
    summary: 'Get all contributions belonging to a specific group',
  })
  @Get('group/:groupId')
  findByGroup(
    @Param('groupId') groupId: string,
    @Query() pagination: PaginationDto,
    @Req() req: any,
  ) {
    if (groupId !== req.user.groupId) {
      throw new ForbiddenException(
        'You can only view contributions for your own group',
      );
    }
    return this.contributionsService.findByGroup(
      groupId,
      pagination.page,
      pagination.limit,
    );
  }

  // GET /contributions/member/:memberId
  @ApiOperation({ summary: 'Get all contributions for a specific member' })
  @Get('member/:memberId')
  async findByMember(
    @Param('memberId') memberId: string,
    @Query() pagination: PaginationDto,
    @Req() req: any,
  ) {
    const memberGroupId = await this.contributionsService.findMemberGroupId(
      memberId,
    );
    this.assertGroupAccess(memberGroupId, req.user.groupId);
    return this.contributionsService.findByMember(
      memberId,
      pagination.page,
      pagination.limit,
    );
  }

  // GET /contributions/:id
  @ApiOperation({ summary: 'Get a specific contribution by ID' })
  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const contributionGroupId =
      await this.contributionsService.findContributionGroupId(id);
    this.assertGroupAccess(contributionGroupId, req.user.groupId);
    return this.contributionsService.findOne(id);
  }

  // ─── Authorisation helper ─────────────────────────────
  private assertGroupAccess(
    requestedGroupId: string,
    userGroupId: string,
  ): void {
    if (requestedGroupId !== userGroupId) {
      throw new ForbiddenException(
        'You can only access resources in your own group',
      );
    }
  }
}
