// The contributions module is responsible for managing contributions in the system. It provides services for creating, retrieving, updating, and deleting contributions, as well as any necessary business logic related to contributions. It interacts with the database through the DrizzleDbModule to store and retrieve contribution data.
import { Module } from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { ContributionsController } from './contributions.controller';
import { DrizzleDbModule } from 'src/db/drizzle_db/drizzle_db.module';
@Module({
  imports: [DrizzleDbModule],
  providers: [ContributionsService],
  controllers: [ContributionsController],
  exports: [ContributionsService],
})
export class ContributionsModule {}
