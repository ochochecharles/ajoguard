import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { AuditModule } from 'src/audit/audit.module';
import { DrizzleDbModule } from 'src/db/drizzle_db/drizzle_db.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    DrizzleDbModule,
    AuditModule,
    AuthModule,
  ],
  providers: [ExportService],
  controllers: [ExportController]
})
export class ExportModule {}
