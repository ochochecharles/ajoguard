import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { DrizzleDbService } from '../db/drizzle_db/drizzle_db.service';
import { TelegramBotService } from '../ingest/telegram/telegram.bot.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: DrizzleDbService, useValue: { db: {} } },
        { provide: TelegramBotService, useValue: { sendMessage: jest.fn() } },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
