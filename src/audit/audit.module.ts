import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { DrizzleDbModule } from 'src/db/drizzle_db/drizzle_db.module';

@Module({
  imports: [DrizzleDbModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
