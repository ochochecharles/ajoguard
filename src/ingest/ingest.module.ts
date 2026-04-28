// The work of the ingest module is to receive raw contribution data (e.g. from SMS, Web, Whatsapp), normalise it, and pass it to the normaliser module for validation and processing
import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { NormaliserModule } from '../normaliser/normaliser.module';
import { SmsParserService } from './sms.parser/sms.parser.service';
import { WhatsappParserService } from './whatsapp.parser/whatsapp.parser.service';
import { WhatsappReplyService } from './whatsapp-reply/whatsapp-reply.service';

@Module({
  imports: [
    NormaliserModule,
  ],
  controllers: [IngestController],
  providers: [
    SmsParserService,
    WhatsappParserService,
    WhatsappReplyService,
  ],
})
export class IngestModule {}