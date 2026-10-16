import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Env } from '../config/env.validation';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

function createClient(config: ConfigService<Env, true>): Redis {
  return new Redis(config.get('REDIS_URL'), { maxRetriesPerRequest: null, lazyConnect: false });
}

// The ready check issues INFO, which fails once psubscribe has put the connection in subscriber mode.
function createSubscriber(config: ConfigService<Env, true>): Redis {
  return new Redis(config.get('REDIS_URL'), {
    maxRetriesPerRequest: null,
    lazyConnect: false,
    enableReadyCheck: false,
  });
}

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, inject: [ConfigService], useFactory: createClient },
    { provide: REDIS_SUBSCRIBER, inject: [ConfigService], useFactory: createSubscriber },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.client.quit(), this.subscriber.quit()]);
  }
}
