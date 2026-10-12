import { HttpStatus, Injectable } from '@nestjs/common';
import { EventStatus, Prisma, SeatStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { EventsService } from '../events/events.service';
import { HoldsService, MAX_HELD_SEATS_PER_EVENT } from '../holds/holds.service';
import { PrismaService } from '../prisma/prisma.service';
import { HoldsQueue } from '../queue/holds.queue';
import { EventPublisher } from '../realtime/event-publisher';

export interface HoldResponse {
  seatId: string;
  expiresAt: string;
}

export interface BookingResult {
  bookingId: string;
  seatIds: string[];
  totalCents: number;
}

export interface MyBooking {
  id: string;
  eventName: string;
  seats: { rowLabel: string; seatNumber: number }[];
  totalCents: number;
  createdAt: string;
}

interface LockedSeatRow {
  id: string;
  status: SeatStatus;
  price_cents: number;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly holds: HoldsService,
    private readonly publisher: EventPublisher,
    private readonly holdsQueue: HoldsQueue,
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

    await this.holdsQueue.scheduleExpiry(
      { eventId, seatId, userId: user.id, holdToken: result.holdToken },
      this.holds.ttlSeconds * 1000,
    );
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

  async confirm(eventId: string, user: AuthUser): Promise<BookingResult> {
    const heldSeatIds = await this.holds.getHeldSeatIds(eventId, user.id);
    if (heldSeatIds.length === 0) {
      throw new AppException(ErrorCode.NO_HELD_SEATS, HttpStatus.BAD_REQUEST, 'No held seats to confirm');
    }
    const values = await this.holds.getHoldValues(eventId, heldSeatIds);
    const lostSeatIds = heldSeatIds.filter((_, i) => !values[i]?.startsWith(`${user.id}:`));
    if (lostSeatIds.length > 0) {
      throw new AppException(ErrorCode.HOLD_EXPIRED, HttpStatus.CONFLICT, 'Some holds expired', { lostSeatIds });
    }

    // Lock in a stable order so two overlapping confirms never deadlock.
    const seatIds = [...heldSeatIds].sort();
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedSeatRow[]>(
        Prisma.sql`SELECT id, status, price_cents FROM seats
                   WHERE event_id = ${eventId}::uuid AND id = ANY(${seatIds}::uuid[])
                   ORDER BY id FOR UPDATE`,
      );
      if (rows.length !== seatIds.length) {
        throw new AppException(ErrorCode.SEAT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Seat not found');
      }
      const sold = rows.filter((row) => row.status === SeatStatus.sold).map((row) => row.id);
      if (sold.length > 0) {
        throw new AppException(ErrorCode.SEAT_SOLD, HttpStatus.CONFLICT, 'Seat already sold', { seatIds: sold });
      }
      const totalCents = rows.reduce((sum, row) => sum + row.price_cents, 0);
      const booking = await tx.booking.create({
        data: {
          userId: user.id,
          eventId,
          totalCents,
          seats: { create: seatIds.map((seatId) => ({ seatId })) },
        },
      });
      await tx.seat.updateMany({ where: { id: { in: seatIds } }, data: { status: SeatStatus.sold } });
      return { bookingId: booking.id, seatIds, totalCents };
    });

    await this.holds.clearHolds(eventId, user.id, seatIds);
    await this.publisher.publish(eventId, { type: 'sold', seatIds });
    return result;
  }

  async myBookings(user: AuthUser): Promise<MyBooking[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { name: true } },
        seats: { include: { seat: { select: { rowLabel: true, seatNumber: true } } } },
      },
    });
    return bookings.map((booking) => ({
      id: booking.id,
      eventName: booking.event.name,
      seats: booking.seats
        .map(({ seat }) => ({ rowLabel: seat.rowLabel, seatNumber: seat.seatNumber }))
        .sort((a, b) => a.rowLabel.localeCompare(b.rowLabel) || a.seatNumber - b.seatNumber),
      totalCents: booking.totalCents,
      createdAt: booking.createdAt.toISOString(),
    }));
  }
}
