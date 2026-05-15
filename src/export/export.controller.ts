import {
  Controller,
  Get,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ExportService } from './export.service';

@ApiTags('export')
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  // Group exports

  // GET /export/group/:groupId
  @ApiOperation({ summary: 'Download full group report as JSON' })
  @Get('group/:groupId')
  async generateGroupReportJson(
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ) {
    const report = await this.exportService.generateGroupReport(groupId);
    const filename = `ajoguard-group-${groupId.slice(0, 8)}-${Date.now()}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(report, null, 2));
  }

  // GET /export/group/:groupId/pdf
  @ApiOperation({ summary: 'Download full group report as PDF' })
  @Get('group/:groupId/pdf')
  async generateGroupReportPdf(
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ) {
    const report = await this.exportService.generateGroupReport(groupId);
    const filename = `ajoguard-group-${groupId.slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await this.exportService.generateGroupPdf(report, res);
  }

  // GET /export/group/:groupId/csv
  @ApiOperation({ summary: 'Download group contributions as CSV' })
  @Get('group/:groupId/csv')
  async generateGroupReportCsv(
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ) {
    const report = await this.exportService.generateGroupReport(groupId);
    const filename = `ajoguard-group-${groupId.slice(0, 8)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const csv = this.exportService.generateGroupCsv(report);
    return res.send(csv);
  }

  // Member exports 

  // GET /export/member/:memberId
  @ApiOperation({ summary: 'Download member report as JSON' })
  @Get('member/:memberId')
  async generateMemberReportJson(
    @Param('memberId') memberId: string,
    @Res() res: Response,
  ) {
    const report = await this.exportService.generateMemberReport(memberId);
    const filename = `ajoguard-member-${memberId.slice(0, 8)}-${Date.now()}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(report, null, 2));
  }

  // GET /export/member/:memberId/pdf
  @ApiOperation({ summary: 'Download member report as PDF' })
  @Get('member/:memberId/pdf')
  async generateMemberReportPdf(
    @Param('memberId') memberId: string,
    @Res() res: Response,
  ) {
    const report = await this.exportService.generateMemberReport(memberId);
    const filename = `ajoguard-member-${memberId.slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await this.exportService.generateMemberPdf(report, res);
  }

  // GET /export/member/:memberId/csv
  @ApiOperation({ summary: 'Download member contributions as CSV' })
  @Get('member/:memberId/csv')
  async generateMemberReportCsv(
    @Param('memberId') memberId: string,
    @Res() res: Response,
  ) {
    const report = await this.exportService.generateMemberReport(memberId);
    const filename = `ajoguard-member-${memberId.slice(0, 8)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const csv = this.exportService.generateMemberCsv(report);
    return res.send(csv);
  }
}