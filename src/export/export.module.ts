import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { AuditModule } from 'src/audit/audit.module';
import { DrizzleDbModule } from 'src/db/drizzle_db/drizzle_db.module';

@Module({
  imports: [
    DrizzleDbModule,
    AuditModule,
  ],
  providers: [ExportService],
  controllers: [ExportController]
})
export class ExportModule {}
