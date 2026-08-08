import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { DrizzleDbModule } from 'src/db/drizzle_db/drizzle_db.module';
import { TelegramBotService } from '../ingest/telegram/telegram.bot.service';

@Module({
  imports: [DrizzleDbModule],
  providers: [NotificationService, TelegramBotService],
  exports: [NotificationService],
})
export class NotificationModule {}
