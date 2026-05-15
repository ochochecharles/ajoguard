import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { DrizzleDbModule } from 'src/db/drizzle_db/drizzle_db.module';

@Module({
  imports: [DrizzleDbModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
