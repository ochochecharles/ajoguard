// The work of the ingest module is to receive raw contribution data (e.g. from the Web form and Telegram bot), normalise it, and pass it to the normaliser module for validation and processing
import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { NormaliserModule } from '../normaliser/normaliser.module';
import { TelegramBotService } from './telegram/telegram.bot.service';
import { TelegramParserService } from './telegram/telegram.parser.service';
import { DrizzleDbModule } from '../db/drizzle_db/drizzle_db.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [NormaliserModule, DrizzleDbModule, AuthModule],
  controllers: [IngestController],
  providers: [TelegramBotService, TelegramParserService],
})
export class IngestModule {}
