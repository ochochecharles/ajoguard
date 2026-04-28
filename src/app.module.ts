import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DrizzleDbModule } from './db/drizzle_db/drizzle_db.module';
import { GroupsModule } from './groups/groups.module';
import { BullModule } from '@nestjs/bullmq';
import { MembersModule } from './members/members.module';
import { ContributionsModule } from './contributions/contributions.module';
import { NormaliserModule } from './normaliser/normaliser.module';
import { IngestModule } from './ingest/ingest.module';

@Module({
  imports: [DrizzleDbModule, ConfigModule.forRoot({
    isGlobal: true,
  }),
  BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379') ,
      },
    }), GroupsModule, MembersModule, ContributionsModule, NormaliserModule, IngestModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
