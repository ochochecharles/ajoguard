import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsappReplyService {
    private readonly logger = new Logger(WhatsappReplyService.name);

  // Send a WhatsApp message back to the collector
  async send(to: string, message: string): Promise<void> {
    try {
      // Remove + from phone number — Meta expects it without
      const recipient = to.replace('+', '');

      await axios.post(
        `https://graph.facebook.com/v18.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (error) {
      // We log the error but do not throw — a failed reply should never
      // cause the contribution record to fail
      this.logger.error(
        `Failed to send WhatsApp reply to ${to}: ${(error as Error).message}`,
      );
    }
  }
}
