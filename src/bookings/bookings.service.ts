import { HttpStatus, Injectable } from '@nestjs/common';
import { EventStatus, SeatStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { EventsService } from '../events/events.service';
import { HoldsService, MAX_HELD_SEATS_PER_EVENT } from '../holds/holds.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../realtime/event-publisher';

export interface HoldResponse {
  seatId: string;
  expiresAt: string;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly holds: HoldsService,
    private readonly publisher: EventPublisher,
  ) {}

  async holdSeat(eventId: string, seatId: string, user: AuthUser): Promise<HoldResponse> {
    const event = await this.events.getEventOrThrow(eventId);
    if (event.status !== EventStatus.on_sale) {
      throw new AppException(ErrorCode.SALES_NOT_OPEN, HttpStatus.CONFLICT, 'Sales are not open');
    }
    const seat = await this.prisma.seat.findFirst({ where: { id: seatId, eventId } });
    if (!seat) {
      throw new AppException(ErrorCode.SEAT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Seat not found');
    }
    if (seat.status === SeatStatus.sold) {
      // Fast reject only; the confirm transaction is the real guarantee.
      throw new AppException(ErrorCode.SEAT_SOLD, HttpStatus.CONFLICT, 'Seat already sold', { seatIds: [seatId] });
    }

    const result = await this.holds.tryHold(eventId, seatId, user.id);
    if (result.outcome === 'limit_reached') {
      throw new AppException(ErrorCode.HOLD_LIMIT_REACHED, HttpStatus.CONFLICT, 'Too many held seats', {
        maxSeats: MAX_HELD_SEATS_PER_EVENT,
      });
    }
    if (result.outcome === 'seat_held') {
      throw new AppException(ErrorCode.SEAT_HELD, HttpStatus.CONFLICT, 'Seat is held by another user');
    }

    const expiresAt = result.expiresAt.toISOString();
    await this.publisher.publish(eventId, { type: 'held', seatIds: [seatId], expiresAt });
    return { seatId, expiresAt };
  }

  async releaseSeat(eventId: string, seatId: string, user: AuthUser): Promise<void> {
    const released = await this.holds.release(eventId, seatId, user.id);
    if (!released) {
      throw new AppException(ErrorCode.NOT_HOLDER, HttpStatus.FORBIDDEN, 'You do not hold this seat');
    }
    await this.publisher.publish(eventId, { type: 'released', seatIds: [seatId] });
  }
}
