import { Module, Global } from '@nestjs/common';
import { DrizzleDbService } from './drizzle_db.service';

@Global()
@Module({
  providers: [DrizzleDbService],
  exports: [DrizzleDbService],
})
export class DrizzleDbModule {}
