import { Test, TestingModule } from '@nestjs/testing';
import { SmsParserService } from './sms.parser.service';

describe('SmsParserService', () => {
  let service: SmsParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsParserService],
    }).compile();

    service = module.get<SmsParserService>(SmsParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
