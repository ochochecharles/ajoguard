import { Test, TestingModule } from '@nestjs/testing';
import { NormaliserService } from './normaliser.service';

describe('NormaliserService', () => {
  let service: NormaliserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NormaliserService],
    }).compile();

    service = module.get<NormaliserService>(NormaliserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
