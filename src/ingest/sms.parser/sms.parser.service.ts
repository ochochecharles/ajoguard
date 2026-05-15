// The SMS parser service is responsible for taking raw SMS text and converting it into structured data that can be processed by the normaliser. It also resolves phone numbers to actual member records in the database.
import { BadRequestException, Injectable } from '@nestjs/common';
import { DrizzleDbService } from '../../db/drizzle_db/drizzle_db.service';
import { members } from '../../db/schema';
import { normalisePhoneNumber } from '../../utils/phone.util';
import { eq, and } from 'drizzle-orm';

export interface ParsedSms {
  memberPhoneNumber: string;
  amount: number;
  collectorPhoneNumber: string;
}

@Injectable()
export class SmsParserService {
  constructor(private readonly drizzleDbService: DrizzleDbService) {}

  // Parse raw SMS text into structured data
  parse(rawText: string, fromNumber: string): ParsedSms {
    const cleaned = rawText.trim().toUpperCase();

    // Expected format: PAY <phoneNumber> <amount>
    const parts = cleaned.split(/\s+/); // split on any whitespace

    // Must have exactly 3 parts: PAY, phone number, amount
    if (parts.length !== 3) {
      throw new BadRequestException(
        `Invalid SMS format. Please send: PAY <phone number> <amount in kobo>. Example: PAY 08012345678 500000`,
      );
    }

    const [command, memberPhoneNumber, amountString] = parts;

    // First word must be PAY
    if (command !== 'PAY') {
      throw new BadRequestException(
        `Unknown command "${command}". Only PAY is supported. Example: PAY 08012345678 500000`,
      );
    }

    // Amount must be a valid number
    const amountInNaira = parseInt(amountString, 10);
    if (isNaN(amountInNaira) || amountInNaira <= 0) {
      throw new BadRequestException(
        `Invalid amount "${amountString}". Amount must be a positive number in kobo. Example: 500000 for ₦5,000`,
      );
    }

    return {
      memberPhoneNumber,
      amount: amountInNaira * 100, // Convert Naira to Kobo
      collectorPhoneNumber: fromNumber,
    };
  }

  // Resolve phone numbers to actual member records in the database
  async resolveMembers(parsed: ParsedSms, groupId?: string) {

    // Normalise both phone numbers before database lookup.
  // The database stores E.164 format so lookups must also use E.164.
  let normalisedCollectorPhone: string;
  let normalisedMemberPhone: string;

  try {
    normalisedCollectorPhone = normalisePhoneNumber(parsed.collectorPhoneNumber);
  } catch {
    throw new BadRequestException(
      `Invalid collector phone number: ${parsed.collectorPhoneNumber}`,
    );
  }

  try {
    normalisedMemberPhone = normalisePhoneNumber(parsed.memberPhoneNumber);
  } catch {
    throw new BadRequestException(
      `Invalid member phone number: ${parsed.memberPhoneNumber}`,
    );
  }

    // Find the collector by their phone number
    const [collector] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(eq(members.phoneNumber, normalisedCollectorPhone));

    if (!collector) {
      throw new BadRequestException(
        `Phone number ${normalisedCollectorPhone} is not registered as a collector in any group`,
      );
    }

    if (collector.role !== 'COLLECTOR') {
      throw new BadRequestException(
        `Phone number ${normalisedCollectorPhone} is not authorised to log contributions`,
      );
    }

    // Find the member by phone number within the collector's group
    // We use the collector's groupId — a collector can only log for their own group
    const [member] = await this.drizzleDbService.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.phoneNumber, normalisedMemberPhone),
          eq(members.groupId, collector.groupId),
        ),
      );

    if (!member) {
      throw new BadRequestException(
        `No member with phone number ${normalisedMemberPhone} found in your group`,
      );
    }

    return { collector, member };
  }
}