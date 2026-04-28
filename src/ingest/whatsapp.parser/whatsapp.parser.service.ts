import { Injectable, BadRequestException } from '@nestjs/common';
import { DrizzleDbService } from '../../db/drizzle_db/drizzle_db.service';
import { members } from '../../db/schema';
import { eq, and } from 'drizzle-orm';

export interface ParsedWhatsApp {
  memberPhoneNumber: string;
  amount: number;
  collectorPhoneNumber: string;
  originalMessage: string;
}

@Injectable()
export class WhatsappParserService {
    constructor(private readonly drizzleDbService: DrizzleDbService) {}

  // Extract the message from Meta's deeply nested webhook payload
  extractMessage(body: any): { text: string; from: string } | null {

    try {
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      // Only process text messages — ignore images, audio, etc
      if (!message || message.type !== 'text') {
        return null;
      }

      return {
        text: message.text.body,
        from: message.from, // Meta sends without + prefix e.g "2348098765432"
      };
    } catch {
      return null;
    }
  }

  // Parse the message text — same format as SMS: PAY <phone> <amount>
  parse(text: string, from: string): ParsedWhatsApp {
    const cleaned = text.trim().toUpperCase();
    const parts = cleaned.split(/\s+/);

    if (parts.length !== 3) {
      throw new BadRequestException(
        `Invalid format. Please send: PAY <phone number> <amount in kobo>\nExample: PAY 08012345678 500000`,
      );
    }

    const [command, memberPhoneNumber, amountString] = parts;

    if (command !== 'PAY') {
      throw new BadRequestException(
        `Unknown command "${command}". Only PAY is supported.\nExample: PAY 08012345678 500000`,
      );
    }

    const amountInNaira = parseInt(amountString, 10);
    if (isNaN(amountInNaira) || amountInNaira <= 0) {
      throw new BadRequestException(
        `Invalid amount "${amountString}". Please send amount in naira.\nExample: 5000 for 500000 kobo (₦5,000)`,
      );
    }

    // Normalise the collector's phone number
    // Meta sends "2348098765432" without + so we add it back
    const collectorPhoneNumber = from.startsWith('+') ? from : `+${from}`;

    return {
      memberPhoneNumber,
      amount: amountInNaira * 100, // Convert Naira to Kobo
      collectorPhoneNumber,
      originalMessage: text,
    };
  }

  // Resolve phone numbers to database records
  // Identical logic to SMS parser
  async resolveMembers(parsed: ParsedWhatsApp) {
    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.phoneNumber, parsed.collectorPhoneNumber));

    if (!collector) {
      throw new BadRequestException(
        `Your number ${parsed.collectorPhoneNumber} is not registered as a collector`,
      );
    }

    if (collector.role !== 'COLLECTOR') {
      throw new BadRequestException(
        `You are not authorised to log contributions`,
      );
    }

    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.phoneNumber, parsed.memberPhoneNumber),
          eq(members.groupId, collector.groupId),
        ),
      );

    if (!member) {
      throw new BadRequestException(
        `No member with phone number ${parsed.memberPhoneNumber} found in your group`,
      );
    }

    return { collector, member };
  }
}
