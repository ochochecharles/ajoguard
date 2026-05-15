import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { ReconciliationModule } from 'src/reconciliation/reconciliation.module';
import { AuditModule } from 'src/audit/audit.module';

@Module({
  imports: [
    ReconciliationModule,
    AuditModule,
  ],
  providers: [GroupsService],
  controllers: [GroupsController],
  exports: [GroupsService],
})
export class GroupsModule {}
