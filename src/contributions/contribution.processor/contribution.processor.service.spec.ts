import { Test, TestingModule } from '@nestjs/testing';
import { ContributionProcessorService } from './contribution.processor.service';

describe('ContributionProcessorService', () => {
  let service: ContributionProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContributionProcessorService],
    }).compile();

    service = module.get<ContributionProcessorService>(
      ContributionProcessorService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
