// The normaliser module is responsible for taking structured contribution data (e.g. from the ingest module), validating it, and processing it into a format that can be stored in the database and used by other parts of the system. It also handles any necessary transformations or calculations on the data.
import { Module } from '@nestjs/common';
import { NormaliserService } from './normaliser.service';
import { DrizzleDbModule } from '../db/drizzle_db/drizzle_db.module';
import { ContributionsModule } from '../contributions/contributions.module';

@Module({
  imports: [
    DrizzleDbModule,
    ContributionsModule,
  ],
  providers: [NormaliserService],
  exports: [NormaliserService],
})
export class NormaliserModule {}