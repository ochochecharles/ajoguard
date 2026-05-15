import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { DrizzleDbModule } from 'src/db/drizzle_db/drizzle_db.module';

@Module({
  imports: [DrizzleDbModule],
  providers: [ReconciliationService],
  exports: [ReconciliationService]
})
export class ReconciliationModule {}
