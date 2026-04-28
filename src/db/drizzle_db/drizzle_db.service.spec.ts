import { Test, TestingModule } from '@nestjs/testing';
import { DrizzleDbService } from './drizzle_db.service';

describe('DrizzleDbService', () => {
  let service: DrizzleDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DrizzleDbService],
    }).compile();

    service = module.get<DrizzleDbService>(DrizzleDbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
