// TelegramBotService wraps the Telegram Bot API (sendMessage, setWebhook).
// It only needs the bot token and uses axios for the HTTPS calls —
// no third-party Telegram SDK is required.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly baseUrl: string | null;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    // Tolerate a missing token so the app can still boot before the bot is
    // configured. The webhook simply reports itself as disabled.
    this.baseUrl = token ? `https://api.telegram.org/bot${token}` : null;
  }

  isConfigured(): boolean {
    return this.baseUrl !== null;
  }

  /**
   * Send a text message to a Telegram chat.
   * Failures are logged, not thrown, so the webhook can always respond quickly.
   */
  async sendMessage(chatId: number | string, text: string): Promise<boolean> {
    if (!this.baseUrl) {
      this.logger.warn('Telegram bot not configured; message not sent');
      return false;
    }
    try {
      await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Telegram sendMessage failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Point the Telegram bot at this app's public webhook URL.
   * Used by the /set-webhook admin route after deployment.
   */
  async setWebhook(url: string): Promise<boolean> {
    if (!this.baseUrl) {
      this.logger.warn('Telegram bot not configured; webhook not set');
      return false;
    }
    try {
      await axios.post(`${this.baseUrl}/setWebhook`, { url });
      return true;
    } catch (error) {
      this.logger.error(
        `Telegram setWebhook failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Useful for diagnosing why updates are not arriving.
   */
  async getWebhookInfo(): Promise<unknown> {
    if (!this.baseUrl) return null;
    const { data } = await axios.get<{ result: unknown }>(
      `${this.baseUrl}/getWebhookInfo`,
    );
    return data.result;
  }
}
