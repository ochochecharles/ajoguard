import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { AuthModule } from './auth/auth.module';
import { AdminAuthMiddleware } from './auth/admin-auth.middleware';

export const BullBoardSetup = BullBoardModule.forRootAsync({
  imports: [AuthModule],
  inject: [AdminAuthMiddleware],
  useFactory: (adminAuthMiddleware: AdminAuthMiddleware) => ({
    route: '/admin/queues',
    adapter: ExpressAdapter,
    middleware: adminAuthMiddleware.use.bind(adminAuthMiddleware),
  }),
});

export const BullBoardContributionsQueue = BullBoardModule.forFeature({
  name: 'contributions',
  adapter: BullMQAdapter,
});
