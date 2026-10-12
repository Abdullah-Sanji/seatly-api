import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { eventChannel, seatMapKey } from '../common/redis-keys';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { EventMessage } from './messages';

/** The single exit point for seat-state changes: drop the cached map, then tell every gateway. */
@Injectable()
export class EventPublisher {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(eventId: string, message: EventMessage): Promise<void> {
    await this.redis.del(seatMapKey(eventId));
    await this.redis.publish(eventChannel(eventId), JSON.stringify(message));
  }
}
