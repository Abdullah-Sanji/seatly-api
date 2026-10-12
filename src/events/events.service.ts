import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';
import Redis from 'ioredis';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { holdKey, seatMapKey } from '../common/redis-keys';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { CachedSeatMap, EventDetail, EventSummary, personaliseSeatMap, toSeatMapCache } from './seat-map';

const SEAT_MAP_CACHE_SECONDS = 5;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async listEvents(): Promise<EventSummary[]> {
    const events = await this.prisma.event.findMany({ orderBy: { startsAt: 'asc' }, select: { id: true } });
    const details = await Promise.all(events.map((event) => this.getEventDetail(event.id, null)));
    return details.map(({ seats: _seats, ...summary }) => summary);
  }

  async getEventDetail(eventId: string, viewerId: string | null): Promise<EventDetail> {
    const cached = await this.redis.get(seatMapKey(eventId));
    const cache: CachedSeatMap = cached
      ? (JSON.parse(cached) as CachedSeatMap)
      : await this.buildAndCache(eventId);
    return personaliseSeatMap(cache, viewerId);
  }

  async getEventOrThrow(eventId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new AppException(ErrorCode.EVENT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Event not found');
    }
    return event;
  }

  private async buildAndCache(eventId: string): Promise<CachedSeatMap> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { seats: { orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }] } },
    });
    if (!event) {
      throw new AppException(ErrorCode.EVENT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Event not found');
    }
    const holdValues =
      event.seats.length === 0
        ? []
        : await this.redis.mget(...event.seats.map((seat) => holdKey(eventId, seat.id)));
    const cache = toSeatMapCache(event, holdValues);
    await this.redis.set(seatMapKey(eventId), JSON.stringify(cache), 'EX', SEAT_MAP_CACHE_SECONDS);
    return cache;
  }
}
