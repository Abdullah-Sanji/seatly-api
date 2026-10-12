import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { holdKey, holdValue, userHoldsKey } from '../common/redis-keys';
import { Env } from '../config/env.validation';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { EXPIRE_LUA, HOLD_LUA, RELEASE_LUA } from './hold-scripts';

export const MAX_HELD_SEATS_PER_EVENT = 6;

export type HoldResult =
  | { outcome: 'held'; holdToken: string; expiresAt: Date }
  | { outcome: 'seat_held' }
  | { outcome: 'limit_reached' };

/** ioredis adds defineCommand() results as methods at runtime; this interface types them. */
interface HoldCommands {
  seatlyHold(
    holdKey: string,
    userSetKey: string,
    value: string,
    ttl: number,
    seatId: string,
    maxSeats: number,
  ): Promise<number>;
  seatlyRelease(holdKey: string, userSetKey: string, userId: string, seatId: string): Promise<number>;
  seatlyExpire(
    holdKey: string,
    userSetKey: string,
    expected: string,
    seatId: string,
    userId: string,
  ): Promise<number>;
}

@Injectable()
export class HoldsService {
  readonly ttlSeconds: number;
  private readonly scripted: Redis & HoldCommands;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = config.get('HOLD_TTL_SECONDS');
    redis.defineCommand('seatlyHold', { numberOfKeys: 2, lua: HOLD_LUA });
    redis.defineCommand('seatlyRelease', { numberOfKeys: 2, lua: RELEASE_LUA });
    redis.defineCommand('seatlyExpire', { numberOfKeys: 2, lua: EXPIRE_LUA });
    this.scripted = redis as Redis & HoldCommands;
  }

  async tryHold(eventId: string, seatId: string, userId: string): Promise<HoldResult> {
    const holdToken = randomUUID();
    const result = await this.scripted.seatlyHold(
      holdKey(eventId, seatId),
      userHoldsKey(userId, eventId),
      holdValue(userId, holdToken),
      this.ttlSeconds,
      seatId,
      MAX_HELD_SEATS_PER_EVENT,
    );
    if (result === -1) return { outcome: 'limit_reached' };
    if (result === 0) return { outcome: 'seat_held' };
    return { outcome: 'held', holdToken, expiresAt: new Date(Date.now() + this.ttlSeconds * 1000) };
  }

  async release(eventId: string, seatId: string, userId: string): Promise<boolean> {
    const result = await this.scripted.seatlyRelease(
      holdKey(eventId, seatId),
      userHoldsKey(userId, eventId),
      userId,
      seatId,
    );
    return result === 1;
  }

  async expire(eventId: string, seatId: string, userId: string, holdToken: string): Promise<boolean> {
    const result = await this.scripted.seatlyExpire(
      holdKey(eventId, seatId),
      userHoldsKey(userId, eventId),
      holdValue(userId, holdToken),
      seatId,
      userId,
    );
    return result === 1;
  }

  getHeldSeatIds(eventId: string, userId: string): Promise<string[]> {
    return this.redis.smembers(userHoldsKey(userId, eventId));
  }

  getHoldValues(eventId: string, seatIds: string[]): Promise<(string | null)[]> {
    if (seatIds.length === 0) return Promise.resolve([]);
    return this.redis.mget(...seatIds.map((seatId) => holdKey(eventId, seatId)));
  }

  async clearHolds(eventId: string, userId: string, seatIds: string[]): Promise<void> {
    const keys = [...seatIds.map((seatId) => holdKey(eventId, seatId)), userHoldsKey(userId, eventId)];
    await this.redis.del(...keys);
  }
}
