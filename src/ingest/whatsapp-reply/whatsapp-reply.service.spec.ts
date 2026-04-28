import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappReplyService } from './whatsapp-reply.service';

describe('WhatsappReplyService', () => {
  let service: WhatsappReplyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappReplyService],
    }).compile();

    service = module.get<WhatsappReplyService>(WhatsappReplyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
