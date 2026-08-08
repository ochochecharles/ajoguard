// TelegramParserService extracts fields from the Telegram webhook update and
// parses the two supported commands:
//   /link <phoneNumber>   — link a collector's Telegram account to their profile
//   PAY <phoneNumber> <amount in naira>  — record a member's contribution
import { Injectable, BadRequestException } from '@nestjs/common';

export interface ParsedTelegramUpdate {
  chatId: number;
  senderId: string;
  text: string;
}

export interface ParsedPay {
  memberPhoneNumber: string;
  amountInNaira: number;
}

@Injectable()
export class TelegramParserService {
  /**
   * Extract a message from a Telegram webhook update.
   * Returns null for edits-heavy/non-text updates so callers can ignore them.
   */
  extractMessage(body: unknown): ParsedTelegramUpdate | null {
    const value = body as {
      message?: {
        chat?: { id?: number };
        from?: { id?: number };
        text?: string;
      };
      edited_message?: {
        chat?: { id?: number };
        from?: { id?: number };
        text?: string;
      };
    };

    const message = value?.message ?? value?.edited_message;
    if (!message?.text || message.chat?.id === undefined) {
      return null;
    }

    return {
      chatId: message.chat.id,
      senderId: String(message.from?.id ?? ''),
      text: message.text,
    };
  }

  isPayCommand(text: string): boolean {
    return /^pay(\s|$)/i.test(text.trim());
  }

  isLinkCommand(text: string): boolean {
    return /^\/link(\s|$)/i.test(text.trim());
  }

  /**
   * Parse a PAY command.
   * Expected format: PAY <member phone number> <amount in naira>
   * Example:         PAY 08012345678 5000
   */
  parsePayCommand(text: string): ParsedPay {
    const cleaned = text.trim().toUpperCase();
    const parts = cleaned.split(/\s+/);

    if (parts.length !== 3) {
      throw new BadRequestException(
        'Invalid format. Send: PAY <member phone> <amount in naira>\nExample: PAY 08012345678 5000',
      );
    }

    const [command, memberPhoneNumber, amountString] = parts;

    if (command !== 'PAY') {
      throw new BadRequestException(
        `Unknown command "${command}". Only PAY is supported.\nExample: PAY 08012345678 5000`,
      );
    }

    const amountInNaira = parseInt(amountString, 10);
    if (isNaN(amountInNaira) || amountInNaira <= 0) {
      throw new BadRequestException(
        'Invalid amount. Please provide a positive amount in naira.\nExample: PAY 08012345678 5000',
      );
    }

    return { memberPhoneNumber, amountInNaira };
  }

  /**
   * Extract the phone number from a /link command.
   * Expected: /link <collector phone number>
   */
  extractLinkPhone(text: string): string {
    const phone = text.replace(/^\/link/i, '').trim();
    if (!phone) {
      throw new BadRequestException(
        'Please include your phone number.\nExample: /link 08012345678',
      );
    }
    return phone;
  }

  helpText(): string {
    return (
      'Welcome to AjoGuard!\n\n' +
      'Commands:\n' +
      '/help - show this message\n' +
      '/link <your phone number> - link this Telegram account to your profile\n' +
      'PAY <member phone> <amount in naira> - record a contribution\n\n' +
      'Example: PAY 08012345678 5000'
    );
  }
}
