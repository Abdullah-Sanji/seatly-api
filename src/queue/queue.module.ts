import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env.validation';
import { HoldsModule } from '../holds/holds.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { parseRedisUrl } from '../redis/redis-url';
import { HoldsProcessor } from './holds.processor';
import { HoldsQueue } from './holds.queue';
import { HOLDS_QUEUE } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: parseRedisUrl(config.get('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue({ name: HOLDS_QUEUE }),
    HoldsModule,
    RealtimeModule,
  ],
  providers: [HoldsQueue, HoldsProcessor],
  exports: [HoldsQueue],
})
export class QueueModule {}
