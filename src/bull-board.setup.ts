import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

export const BullBoardSetup = BullBoardModule.forRoot({
  route: '/admin/queues',
  adapter: ExpressAdapter,
});

export const BullBoardContributionsQueue = BullBoardModule.forFeature({
  name: 'contributions',
  adapter: BullMQAdapter,
});