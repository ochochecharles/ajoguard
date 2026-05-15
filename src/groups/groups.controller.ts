import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { ReconciliationService } from 'src/reconciliation/reconciliation.service';
import { AuditService } from 'src/audit/audit.service';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly reconciliationService: ReconciliationService,
    private readonly auditService: AuditService,
  ) {}

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

  // GET /groups/:id/summary
  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.reconciliationService.getGroupSummary(id);
  }

  // POST /groups/:id/payout
  @Post(':id/payout')
  recordPayout(
    @Param('id') id: string,
    @Body() body: { recipientId: string; recordedById: string },
  ) {
    return this.reconciliationService.recordPayout(
      id,
      body.recipientId,
      body.recordedById,
    );
  }

  // View full audit history for a group
  @Get(':id/audit')
  getAuditHistory(@Param('id') id: string) {
    return this.auditService.getAuditHistory(id);
  }

  // GET /groups/:id/audit/verify
  // Verify the audit chain is intact and untampered
  @Get(':id/audit/verify')
  verifyAuditChain(@Param('id') id: string) {
    return this.auditService.verifyChain(id);
  }
}