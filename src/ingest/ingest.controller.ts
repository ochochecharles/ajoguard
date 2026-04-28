import {
  Controller,
  Post,
  Body,
  HttpCode,
  Get,
  Query,
  Logger,
} from '@nestjs/common';
import { NormaliserService } from '../normaliser/normaliser.service';
import { CreateContributionDto, ContributionChannel } from '../contributions/dto/create-contribution.dto';
import {  SmsParserService } from './sms.parser/sms.parser.service';
import { WhatsappParserService } from './whatsapp.parser/whatsapp.parser.service';
import { WhatsappReplyService } from './whatsapp-reply/whatsapp-reply.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('ingest')
@Controller('ingest')
export class IngestController {
      private readonly logger = new Logger(IngestController.name)
    constructor(
      private readonly normaliserService: NormaliserService,
      private readonly smsParserService: SmsParserService,
      private readonly whatsappParserService: WhatsappParserService,
      private readonly whatsappReplyService: WhatsappReplyService,
    ) {}

  // Web form channel — simplest input, used by agents and group leaders
  @Post('web')
  async ingestFromWeb(@Body() dto: CreateContributionDto) {

    // Convert Naira to Kobo before normalising
  const normalisedDto = {
    ...dto,
    amount: dto.amount * 100, // ₦5,000 → 500000 kobo
  };

    // rawPayload is the original request body as a string
    // We store this forever so we can always prove what was received
    const rawPayload = JSON.stringify(dto);

    const event = await this.normaliserService.normalise(normalisedDto, rawPayload);

    return {
      message: 'Contribution recorded successfully',
      eventId: event.eventId,
      memberId: event.memberId,
      groupId: event.groupId,
      amount: event.amount,
      amountInNaira: event.amount / 100,
      channel: event.channel,
      receivedAt: event.receivedAt,
    };
  }

  // POST /ingest/sms
  // Africa's Talking calls this webhook when an SMS is received
  @Post('sms')
  @HttpCode(200)
  async ingestFromSms(@Body() body: any) {

    // Africa's Talking sends these fields
    const rawText: string = body.text;
    const fromNumber: string = body.from;

    // Parse the raw SMS text into structured data (amount, member phone, etc)
    const parsed = this.smsParserService.parse(rawText, fromNumber);

    // Resolve phone numbers to real member records
    const { collector, member } = await this.smsParserService.resolveMembers(parsed);

    // Build the DTO the normaliser expects
    const dto: CreateContributionDto = {
      groupId: collector.groupId,
      memberId: member.id,
      collectorId: collector.id,
      amount: parsed.amount,
      channel: ContributionChannel.SMS,
    };

    // Pass to normaliser — same flow as web channel
    const rawPayload = `FROM:${fromNumber} TEXT:${rawText}`;
    const event = await this.normaliserService.normalise(dto, rawPayload);

    // Africa's Talking expects a plain text or simple response
    return {
      message: 'Contribution recorded successfully',
      eventId: event.eventId,
      amountInNaira: event.amount / 100,
      receivedAt: event.receivedAt,
    };
  }

  // ─── WhatsApp channel ─────────────────────────────────

  // GET /ingest/whatsapp
  // Meta calls this once to verify your webhook is real
  @Get('whatsapp')
  verifyWhatsAppWebhook(@Query() query: any): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    // Meta sends your verify token back — you confirm it matches
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      this.logger.log('WhatsApp webhook verified successfully');
      return challenge; // send challenge back to Meta to complete verification
    }

    // If tokens do not match, reject
    return 'Verification failed';
  }

  // POST /ingest/whatsapp
  // Meta calls this every time someone sends a message
  @Post('whatsapp')
  @HttpCode(200)
  async ingestFromWhatsApp(@Body() body: any) {

    const extracted = this.whatsappParserService.extractMessage(body);
    if (!extracted) {
      return { status: 'ignored' };
    }

    const { text, from } = extracted;
    const collectorPhoneNumber = from.startsWith('+') ? from : `+${from}`;

    try {
      // Parse the raw text
      const parsed = this.whatsappParserService.parse(text, from);

      // Resolve phone numbers to database records
      const { collector, member } = await this.whatsappParserService.resolveMembers(parsed);

      const dto: CreateContributionDto = {
        groupId: collector.groupId,
        memberId: member.id,
        collectorId: collector.id,
        amount: parsed.amount,
        channel: ContributionChannel.WHATSAPP,
      };

      // Pass to normaliser
      const rawPayload = `FROM:${from} TEXT:${text}`;
      const event = await this.normaliserService.normalise(dto, rawPayload);

      // Send confirmation back to collector on WhatsApp
      await this.whatsappReplyService.send(
        collectorPhoneNumber,
        `Contribution recorded successfully!\n\nAmount: ₦${event.amount / 100}\nGroup: ${event.groupId}\nRef: ${event.eventId.slice(0, 8).toUpperCase()}\nTime: ${event.receivedAt.toISOString()}`,
      );

      return { status: 'processed' };

    } catch (error) {
      // If anything goes wrong, send an error message back to the collector
      // so they know to try again — then return 200 to Meta so they stop retrying
      this.logger.error(`WhatsApp ingestion error: ${(error as Error).message}`);

      await this.whatsappReplyService.send(
        collectorPhoneNumber,
        `Could not record contribution.\n\nReason: ${(error as Error).message}\n\nPlease check the format and try again:\nPAY <phone number> <amount in kobo>\nExample: PAY 08012345678 500000`,
      );

      return { status: 'error', message: (error as Error).message };
    }
  }
}