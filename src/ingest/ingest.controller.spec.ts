import { Test, TestingModule } from '@nestjs/testing';
import { IngestController } from './ingest.controller';
import { NormaliserService } from '../normaliser/normaliser.service';
import { TelegramBotService } from './telegram/telegram.bot.service';
import { TelegramParserService } from './telegram/telegram.parser.service';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { RolesGuard } from '../auth/roles.guard';

describe('IngestController', () => {
  let controller: IngestController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestController],
      providers: [
        { provide: NormaliserService, useValue: { normalise: jest.fn() } },
        { provide: TelegramBotService, useValue: { sendMessage: jest.fn() } },
        {
          provide: TelegramParserService,
          useValue: {
            extractMessage: jest.fn(),
            isLinkCommand: jest.fn(),
            isPayCommand: jest.fn(),
            parsePayCommand: jest.fn(),
            extractLinkPhone: jest.fn(),
            helpText: jest.fn(),
          },
        },
        { provide: DrizzleDbService, useValue: { db: {} } },
        RolesGuard,
      ],
    }).compile();

    controller = module.get<IngestController>(IngestController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
