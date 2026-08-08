import {
  Controller,
  Post,
  Body,
  HttpCode,
  Logger,
  UseGuards,
  Req,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { NormaliserService } from '../normaliser/normaliser.service';
import {
  CreateContributionDto,
  ContributionChannel,
} from '../contributions/dto/create-contribution.dto';
import { TelegramBotService } from './telegram/telegram.bot.service';
import { TelegramParserService } from './telegram/telegram.parser.service';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { members } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { normalisePhoneNumber } from '../utils/phone.util';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

@ApiTags('ingest')
@Controller('ingest')
export class IngestController {
  private readonly logger = new Logger(IngestController.name);
  constructor(
    private readonly normaliserService: NormaliserService,
    private readonly telegramBotService: TelegramBotService,
    private readonly telegramParserService: TelegramParserService,
    private readonly drizzleDbService: DrizzleDbService,
  ) {}

  // Web form channel — simplest input, used by agents and group leaders
  @ApiOperation({ summary: 'Ingest a contribution from the web channel' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COLLECTOR')
  @Post('web')
  async ingestFromWeb(
    @Body() dto: CreateContributionDto,
    @Req() req: { user: { collectorId: string } },
  ) {
    // Override collectorId with the authenticated collector's ID
    // Never trust the client to send the correct collectorId
    dto.collectorId = req.user.collectorId;

    // rawPayload is the original request body as a string
    // We store this forever so we can always prove what was received
    const rawPayload = JSON.stringify(dto);

    // Convert Naira to Kobo before normalising
    const normalisedDto = {
      ...dto,
      amount: dto.amount * 100,
    };

    const event = await this.normaliserService.normalise(
      normalisedDto,
      rawPayload,
    );

    return {
      message: 'Contribution recorded successfully',
      eventId: event.eventId,
      memberId: event.memberId,
      groupId: event.groupId,
      amount: event.amount / 100,
      amountInKobo: event.amount,
      channel: event.channel,
      receivedAt: event.receivedAt,
    };
  }

  // ─── Telegram channel ─────────────────────────────────

  // POST /ingest/telegram/webhook
  // Telegram calls this every time someone sends a message to the bot.
  @ApiOperation({ summary: 'Telegram bot webhook' })
  @Throttle({ default: { limit: 5, ttl: 1000 } })
  @Post('telegram/webhook')
  @HttpCode(200)
  async telegramWebhook(
    @Body() body: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    if (!this.telegramBotService.isConfigured()) {
      return { status: 'disabled' };
    }

    this.assertWebhookSecret(secretToken);

    const update = this.telegramParserService.extractMessage(body);
    if (!update) {
      return { status: 'ignored' };
    }

    const { chatId, senderId, text } = update;

    try {
      if (this.telegramParserService.isLinkCommand(text)) {
        return await this.linkCollector(chatId, senderId, text);
      }

      if (this.telegramParserService.isPayCommand(text)) {
        return await this.recordTelegramContribution(chatId, senderId, text);
      }

      await this.telegramBotService.sendMessage(
        chatId,
        this.telegramParserService.helpText(),
      );
      return { status: 'processed' };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Telegram ingestion error: ${message}`);
      await this.telegramBotService.sendMessage(
        chatId,
        `Could not record contribution.\n\nReason: ${message}\n\nSend /help for usage.`,
      );
      return { status: 'error' };
    }
  }

  // Require TELEGRAM_WEBHOOK_SECRET and compare it in constant time.
  // Throws 401 (not 200) so Telegram stops retrying unauthorised calls.
  private assertWebhookSecret(secretToken?: string): void {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!expectedSecret) {
      throw new UnauthorizedException(
        'TELEGRAM_WEBHOOK_SECRET is not configured',
      );
    }

    if (!secretToken) {
      throw new UnauthorizedException('Missing webhook secret');
    }

    const expected = Buffer.from(expectedSecret, 'utf8');
    const provided = Buffer.from(secretToken, 'utf8');

    const lengthsEqual = expected.length === provided.length;
    const hashesEqual =
      lengthsEqual &&
      timingSafeEqual(expected, provided);

    if (!lengthsEqual || !hashesEqual) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  // POST /ingest/telegram/set-webhook
  // Admin-only helper to point the bot at this app's public URL after deploy.
  @ApiOperation({ summary: 'Configure the Telegram bot webhook URL' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COLLECTOR')
  @Post('telegram/set-webhook')
  async setTelegramWebhook() {
    if (!this.telegramBotService.isConfigured()) {
      return { ok: false, message: 'TELEGRAM_BOT_TOKEN is not configured' };
    }
    const url = process.env.TELEGRAM_WEBHOOK_URL;
    if (!url) {
      return { ok: false, message: 'TELEGRAM_WEBHOOK_URL is not configured' };
    }
    const ok = await this.telegramBotService.setWebhook(url);
    return { ok };
  }

  // ─── Helpers ────────────────────────────────────────

  // /link <phoneNumber>
  private async linkCollector(chatId: number, senderId: string, text: string) {
    const phone = this.telegramParserService.extractLinkPhone(text);
    const normalisedPhone = normalisePhoneNumber(phone);

    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.phoneNumber, normalisedPhone));

    if (!collector) {
      throw new Error(
        `Phone ${normalisedPhone} is not registered to any member.`,
      );
    }

    await this.drizzleDbService.db
      .update(members)
      .set({ telegramUserId: senderId })
      .where(eq(members.id, collector.id));

    await this.telegramBotService.sendMessage(
      chatId,
      `Linked successfully as ${collector.name}. ` +
        (collector.role === 'COLLECTOR'
          ? 'You can now send PAY commands.'
          : 'You will now receive payment reminders here.'),
    );

    return { status: 'processed' };
  }

  // PAY <member phone> <amount in naira>
  private async recordTelegramContribution(
    chatId: number,
    senderId: string,
    text: string,
  ) {
    // Identify the collector from their linked Telegram account
    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.telegramUserId, senderId));

    if (!collector) {
      throw new Error(
        'Your Telegram account is not linked. Send /link <your phone number> first.',
      );
    }

    if (collector.role !== 'COLLECTOR') {
      throw new Error('You are not authorised to log contributions.');
    }

    const parsed = this.telegramParserService.parsePayCommand(text);

    // Resolve the member by phone within the collector's own group
    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(
        and(
          eq(
            members.phoneNumber,
            normalisePhoneNumber(parsed.memberPhoneNumber),
          ),
          eq(members.groupId, collector.groupId),
        ),
      );

    if (!member) {
      throw new Error(
        `No member with phone ${parsed.memberPhoneNumber} found in your group.`,
      );
    }

    const dto: CreateContributionDto = {
      groupId: collector.groupId,
      memberId: member.id,
      collectorId: collector.id,
      amount: parsed.amountInNaira * 100, // Naira → Kobo
      channel: ContributionChannel.TELEGRAM,
    };

    const rawPayload = `FROM_TELEGRAM:${chatId} TEXT:${text}`;
    const event = await this.normaliserService.normalise(dto, rawPayload);

    await this.telegramBotService.sendMessage(
      chatId,
      `Contribution recorded successfully!\n\nAmount: ₦${event.amount / 100}\nRef: ${event.eventId.slice(0, 8).toUpperCase()}`,
    );

    return { status: 'processed' };
  }
}
