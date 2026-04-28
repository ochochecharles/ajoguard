import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappParserService } from './whatsapp.parser.service';

describe('WhatsappParserService', () => {
  let service: WhatsappParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappParserService],
    }).compile();

    service = module.get<WhatsappParserService>(WhatsappParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
