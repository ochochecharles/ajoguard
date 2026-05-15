import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { AuditService } from '../audit/audit.service';
import {
  groups,
  members,
  contributions,
  reconciliationLogs,
  payouts,
} from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { Response } from 'express';
import PDFDocument from 'pdfkit';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly drizzleDbService: DrizzleDbService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Generate group report data ───────────────────────
  async generateGroupReport(groupId: string) {
    this.logger.log(`Generating group report for ${groupId}`);

    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }

    const allMembers = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.groupId, groupId));

    const allContributions = await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(
        and(
          eq(contributions.groupId, groupId),
          eq(contributions.status, 'PROCESSED'),
        ),
      );

    const allPayouts = await this.drizzleDbService.db
      .select()
      .from(payouts)
      .where(eq(payouts.groupId, groupId));

    const allReconciliationLogs = await this.drizzleDbService.db
      .select()
      .from(reconciliationLogs)
      .where(eq(reconciliationLogs.groupId, groupId))
      .orderBy(desc(reconciliationLogs.checkedAt));

    const auditVerification = await this.auditService.verifyChain(groupId);

    const totalCollected = allContributions.reduce(
      (sum, c) => sum + c.amount, 0,
    );

    const totalPaidOut = allPayouts.reduce(
      (sum, p) => sum + p.amount, 0,
    );

    const activeMembers = allMembers.filter((m) => m.status === 'ACTIVE');
    const regularMembers = allMembers.filter((m) => m.role === 'MEMBER');

    const memberSummaries = regularMembers.map((member) => {
      const memberContributions = allContributions.filter(
        (c) => c.memberId === member.id,
      );
      const memberTotal = memberContributions.reduce(
        (sum, c) => sum + c.amount, 0,
      );

      return {
        memberId:              member.id,
        memberName:            member.name,
        phoneNumber:           member.phoneNumber,
        status:                member.status,
        payoutOrder:           member.payoutOrder,
        totalContributions:    memberContributions.length,
        totalContributed:      memberTotal,
        totalContributedNaira: memberTotal / 100,
        hasReceivedPayout:     allPayouts.some((p) => p.recipientId === member.id),
        contributions:         memberContributions.map((c) => ({
          contributionId: c.id,
          amount:         c.amount,
          amountNaira:    c.amount / 100,
          channel:        c.channel,
          receivedAt:     c.receivedAt,
          processedAt:    c.processedAt,
        })),
      };
    });

    return {
      generatedAt:   new Date(),
      reportVersion: '1.0',

      group: {
        id:               group.id,
        name:             group.name,
        description:      group.description,
        cycleInterval:    group.cycleInterval,
        cycleAmount:      group.cycleAmount,
        cycleAmountNaira: group.cycleAmount / 100,
        isActive:         group.isActive,
        cycleStartDate:   group.cycleStartDate,
        currentPosition:  group.currentPosition,
        createdAt:        group.createdAt,
      },

      summary: {
        totalMembers:        allMembers.length,
        activeMembers:       activeMembers.length,
        totalContributions:  allContributions.length,
        totalCollected,
        totalCollectedNaira: totalCollected / 100,
        totalPaidOut,
        totalPaidOutNaira:   totalPaidOut / 100,
        currentBalance:      totalCollected - totalPaidOut,
        currentBalanceNaira: (totalCollected - totalPaidOut) / 100,
        totalPayouts:        allPayouts.length,
      },

      auditIntegrity: {
        chainValid:   auditVerification.valid,
        totalEntries: auditVerification.totalEntries,
        brokenAt:     auditVerification.brokenAt ?? null,
        reason:       auditVerification.reason ?? null,
        verifiedAt:   new Date(),
      },

      members: memberSummaries,

      payouts: allPayouts.map((p) => ({
        payoutId:        p.id,
        recipientName:   allMembers.find((m) => m.id === p.recipientId)?.name,
        amount:          p.amount,
        amountNaira:     p.amount / 100,
        cycleIdentifier: p.cycleIdentifier,
        payoutDate:      p.payoutDate,
      })),

      reconciliationHistory: allReconciliationLogs.map((log) => ({
        cycleIdentifier:     log.cycleIdentifier,
        status:              log.status,
        totalExpectedNaira:  log.totalExpected / 100,
        totalCollectedNaira: log.totalCollected / 100,
        missingMembers:      log.missingMembers,
        checkedAt:           log.checkedAt,
      })),
    };
  }

  // ─── Generate member report data ──────────────────────
  async generateMemberReport(memberId: string) {
    this.logger.log(`Generating member report for ${memberId}`);

    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.id, memberId));

    if (!member) {
      throw new NotFoundException(`Member ${memberId} not found`);
    }

    const [group] = await this.drizzleDbService.db
      .select()
      .from(groups)
      .where(eq(groups.id, member.groupId));

    const memberContributions = await this.drizzleDbService.db
      .select()
      .from(contributions)
      .where(
        and(
          eq(contributions.memberId, memberId),
          eq(contributions.status, 'PROCESSED'),
        ),
      );

    const memberPayouts = await this.drizzleDbService.db
      .select()
      .from(payouts)
      .where(eq(payouts.recipientId, memberId));

    const totalContributed = memberContributions.reduce(
      (sum, c) => sum + c.amount, 0,
    );

    const totalReceived = memberPayouts.reduce(
      (sum, p) => sum + p.amount, 0,
    );

    const totalCycles = group?.cycleAmount
      ? Math.floor(totalContributed / group.cycleAmount)
      : 0;

    return {
      generatedAt: new Date(),

      member: {
        id:          member.id,
        name:        member.name,
        phoneNumber: member.phoneNumber,
        status:      member.status,
        payoutOrder: member.payoutOrder,
        groupId:     member.groupId,
        groupName:   group?.name,
        memberSince: member.createdAt,
      },

      contributionSummary: {
        totalContributions:    memberContributions.length,
        totalContributed,
        totalContributedNaira: totalContributed / 100,
        cyclesCompleted:       totalCycles,
        hasReceivedPayout:     memberPayouts.length > 0,
        totalReceived,
        totalReceivedNaira:    totalReceived / 100,
      },

      financialHistory: {
        averageContributionNaira: (totalContributed / (memberContributions.length || 1)) / 100,
        firstContribution:        memberContributions[memberContributions.length - 1]?.receivedAt ?? null,
        lastContribution:         memberContributions[0]?.receivedAt ?? null,
        channelsUsed:             [...new Set(memberContributions.map((c) => c.channel))],
      },

      contributions: memberContributions.map((c) => ({
        contributionId: c.id,
        amount:         c.amount,
        amountNaira:    c.amount / 100,
        channel:        c.channel,
        receivedAt:     c.receivedAt,
      })),

      payouts: memberPayouts.map((p) => ({
        payoutId:        p.id,
        amount:          p.amount,
        amountNaira:     p.amount / 100,
        cycleIdentifier: p.cycleIdentifier,
        payoutDate:      p.payoutDate,
      })),
    };
  }

  // ─── Generate group PDF ───────────────────────────────
  async generateGroupPdf(report: any, res: Response): Promise<void> {
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // ── Header ──
    doc
      .fillColor('#1a1a2e')
      .fontSize(24)
      .text('AjoGuard', { align: 'center' });

    doc
      .fillColor('#444')
      .fontSize(14)
      .text('Group Financial Report', { align: 'center' });

    doc
      .fontSize(10)
      .fillColor('#888')
      .text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, { align: 'center' });

    doc.moveDown(2);

    // ── Group details ──
    this.pdfSectionHeader(doc, 'Group Details');

    this.pdfRow(doc, 'Group Name',     report.group.name);
    this.pdfRow(doc, 'Cycle',          report.group.cycleInterval);
    this.pdfRow(doc, 'Amount/Member',  `₦${report.group.cycleAmountNaira}`);
    this.pdfRow(doc, 'Status',         report.group.isActive ? 'Active' : 'Inactive');
    this.pdfRow(doc, 'Created',        new Date(report.group.createdAt).toLocaleDateString());

    doc.moveDown(1.5);

    // ── Financial summary ──
    this.pdfSectionHeader(doc, 'Financial Summary');

    this.pdfRow(doc, 'Total Members',       `${report.summary.totalMembers}`);
    this.pdfRow(doc, 'Active Members',      `${report.summary.activeMembers}`);
    this.pdfRow(doc, 'Total Contributions', `${report.summary.totalContributions}`);
    this.pdfRow(doc, 'Total Collected',     `₦${report.summary.totalCollectedNaira}`);
    this.pdfRow(doc, 'Total Paid Out',      `₦${report.summary.totalPaidOutNaira}`);
    this.pdfRow(doc, 'Current Balance',     `₦${report.summary.currentBalanceNaira}`);

    doc.moveDown(1.5);

    // ── Audit integrity ──
    this.pdfSectionHeader(doc, 'Audit Integrity');

    const chainStatus = report.auditIntegrity.chainValid
      ? '✓ VERIFIED — No tampering detected'
      : '✗ INVALID — Chain integrity compromised';

    this.pdfRow(doc, 'Chain Status',    chainStatus);
    this.pdfRow(doc, 'Total Entries',   `${report.auditIntegrity.totalEntries}`);
    this.pdfRow(doc, 'Verified At',     new Date(report.auditIntegrity.verifiedAt).toLocaleString());

    doc.moveDown(1.5);

    // ── Members ──
    this.pdfSectionHeader(doc, 'Member Contribution Summary');
    doc.moveDown(0.5);

    for (const member of report.members) {
      doc
        .fillColor('#1a1a2e')
        .fontSize(12)
        .text(member.memberName, { underline: true });

      doc.fillColor('#444').fontSize(10);
      doc.text(`  Phone: ${member.phoneNumber ?? 'N/A'}`);
      doc.text(`  Total Contributed: ₦${member.totalContributedNaira}`);
      doc.text(`  Contributions: ${member.totalContributions}`);
      doc.text(`  Received Payout: ${member.hasReceivedPayout ? 'Yes' : 'No'}`);
      doc.moveDown(0.5);
    }

    doc.moveDown(1.5);

    // ── Payouts ──
    if (report.payouts.length > 0) {
      this.pdfSectionHeader(doc, 'Payout History');
      doc.moveDown(0.5);

      for (const payout of report.payouts) {
        doc.fillColor('#444').fontSize(10);
        doc.text(
          `${payout.recipientName} — ₦${payout.amountNaira} — ` +
          `${new Date(payout.payoutDate).toLocaleDateString()} — ` +
          `Cycle: ${payout.cycleIdentifier}`,
        );
      }
    }

    doc.moveDown(2);

    // ── Footer ──
    doc
      .fillColor('#888')
      .fontSize(9)
      .text(
        'This report was generated by AjoGuard — a tamper-evident backend ' +
        'reconciliation engine for informal savings groups.',
        { align: 'center' },
      );

    doc.end();
  }

  // ─── Generate member PDF ──────────────────────────────
  async generateMemberPdf(report: any, res: Response): Promise<void> {
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // ── Header ──
    doc
      .fillColor('#1a1a2e')
      .fontSize(24)
      .text('AjoGuard', { align: 'center' });

    doc
      .fillColor('#444')
      .fontSize(14)
      .text('Member Contribution Report', { align: 'center' });

    doc
      .fontSize(10)
      .fillColor('#888')
      .text(
        `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
        { align: 'center' },
      );

    doc.moveDown(2);

    // ── Member details ──
    this.pdfSectionHeader(doc, 'Member Details');

    this.pdfRow(doc, 'Name',         report.member.name);
    this.pdfRow(doc, 'Phone',        report.member.phoneNumber ?? 'N/A');
    this.pdfRow(doc, 'Group',        report.member.groupName ?? 'N/A');
    this.pdfRow(doc, 'Status',       report.member.status);
    this.pdfRow(doc, 'Member Since', new Date(report.member.memberSince).toLocaleDateString());

    doc.moveDown(1.5);

    // ── Contribution summary ──
    this.pdfSectionHeader(doc, 'Contribution Summary');

    this.pdfRow(doc, 'Total Contributions',  `${report.contributionSummary.totalContributions}`);
    this.pdfRow(doc, 'Total Contributed',    `₦${report.contributionSummary.totalContributedNaira}`);
    this.pdfRow(doc, 'Cycles Completed',     `${report.contributionSummary.cyclesCompleted}`);
    this.pdfRow(doc, 'Received Payout',      report.contributionSummary.hasReceivedPayout ? 'Yes' : 'No');
    this.pdfRow(doc, 'Total Received',       `₦${report.contributionSummary.totalReceivedNaira}`);

    doc.moveDown(1.5);

    // ── Financial history ──
    this.pdfSectionHeader(doc, 'Financial History');

    this.pdfRow(doc, 'Average Contribution', `₦${report.financialHistory.averageContributionNaira}`);
    this.pdfRow(doc, 'First Contribution',
      report.financialHistory.firstContribution
        ? new Date(report.financialHistory.firstContribution).toLocaleDateString()
        : 'N/A',
    );
    this.pdfRow(doc, 'Last Contribution',
      report.financialHistory.lastContribution
        ? new Date(report.financialHistory.lastContribution).toLocaleDateString()
        : 'N/A',
    );
    this.pdfRow(doc, 'Channels Used', report.financialHistory.channelsUsed.join(', '));

    doc.moveDown(1.5);

    // ── Contribution history ──
    this.pdfSectionHeader(doc, 'Full Contribution History');
    doc.moveDown(0.5);

    for (const contribution of report.contributions) {
      doc.fillColor('#444').fontSize(10);
      doc.text(
        `₦${contribution.amountNaira} — ` +
        `${contribution.channel} — ` +
        `${new Date(contribution.receivedAt).toLocaleDateString()}`,
      );
    }

    doc.moveDown(2);

    // ── Footer ──
    doc
      .fillColor('#888')
      .fontSize(9)
      .text(
        'This report was generated by AjoGuard. ' +
        'It can be used as proof of savings history for loan applications.',
        { align: 'center' },
      );

    doc.end();
  }

  // ─── Generate group CSV ───────────────────────────────
  generateGroupCsv(report: any): string {
    const rows: string[] = [];

    // Group summary header
    rows.push('GROUP SUMMARY');
    rows.push(`Name,${report.group.name}`);
    rows.push(`Cycle,${report.group.cycleInterval}`);
    rows.push(`Amount Per Member,₦${report.group.cycleAmountNaira}`);
    rows.push(`Total Collected,₦${report.summary.totalCollectedNaira}`);
    rows.push(`Total Paid Out,₦${report.summary.totalPaidOutNaira}`);
    rows.push(`Current Balance,₦${report.summary.currentBalanceNaira}`);
    rows.push(`Audit Chain Valid,${report.auditIntegrity.chainValid}`);
    rows.push('');

    // Contributions header
    rows.push('CONTRIBUTION RECORDS');
    rows.push([
      'Member Name',
      'Phone Number',
      'Amount (Naira)',
      'Channel',
      'Date Received',
      'Date Processed',
    ].join(','));

    // Contribution rows
    for (const member of report.members) {
      for (const contribution of member.contributions) {
        rows.push([
          `"${member.memberName}"`,
          member.phoneNumber ?? '',
          contribution.amountNaira,
          contribution.channel,
          new Date(contribution.receivedAt).toLocaleDateString(),
          contribution.processedAt
            ? new Date(contribution.processedAt).toLocaleDateString()
            : '',
        ].join(','));
      }
    }

    rows.push('');

    // Payouts section
    if (report.payouts.length > 0) {
      rows.push('PAYOUT RECORDS');
      rows.push([
        'Recipient Name',
        'Amount (Naira)',
        'Cycle',
        'Payout Date',
      ].join(','));

      for (const payout of report.payouts) {
        rows.push([
          `"${payout.recipientName}"`,
          payout.amountNaira,
          payout.cycleIdentifier,
          new Date(payout.payoutDate).toLocaleDateString(),
        ].join(','));
      }
    }

    return rows.join('\n');
  }

  // ─── Generate member CSV ──────────────────────────────
  generateMemberCsv(report: any): string {
    const rows: string[] = [];

    // Member summary
    rows.push('MEMBER SUMMARY');
    rows.push(`Name,${report.member.name}`);
    rows.push(`Phone,${report.member.phoneNumber ?? 'N/A'}`);
    rows.push(`Group,${report.member.groupName}`);
    rows.push(`Total Contributed,₦${report.contributionSummary.totalContributedNaira}`);
    rows.push(`Cycles Completed,${report.contributionSummary.cyclesCompleted}`);
    rows.push(`Received Payout,${report.contributionSummary.hasReceivedPayout}`);
    rows.push('');

    // Contributions
    rows.push('CONTRIBUTION HISTORY');
    rows.push([
      'Contribution ID',
      'Amount (Naira)',
      'Channel',
      'Date',
    ].join(','));

    for (const contribution of report.contributions) {
      rows.push([
        contribution.contributionId,
        contribution.amountNaira,
        contribution.channel,
        new Date(contribution.receivedAt).toLocaleDateString(),
      ].join(','));
    }

    return rows.join('\n');
  }

  // ─── PDF helper: section header ───────────────────────
  private pdfSectionHeader(doc: PDFKit.PDFDocument, title: string): void {
    doc
      .fillColor('#1a1a2e')
      .fontSize(14)
      .text(title, { underline: true });
    doc.moveDown(0.5);
  }

  // ─── PDF helper: key value row ────────────────────────
  private pdfRow(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
  ): void {
    doc
      .fillColor('#555')
      .fontSize(10)
      .text(`${label}:`, { continued: true, width: 160 })
      .fillColor('#222')
      .text(` ${value}`);
  }
}