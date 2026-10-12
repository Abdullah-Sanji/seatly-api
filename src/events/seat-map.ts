import { Event, EventStatus, Seat, SeatStatus } from '@prisma/client';
import { holderIdOf } from '../common/redis-keys';

export type SeatState = 'available' | 'held' | 'held_by_me' | 'sold';

export interface SeatView {
  id: string;
  rowLabel: string;
  seatNumber: number;
  priceCents: number;
  state: SeatState;
}

export interface EventSummary {
  id: string;
  name: string;
  venueName: string;
  startsAt: string;
  salesOpenAt: string;
  status: EventStatus;
  availableCount: number;
}

export interface EventDetail extends EventSummary {
  seats: SeatView[];
}

export interface CachedSeat {
  id: string;
  rowLabel: string;
  seatNumber: number;
  priceCents: number;
  sold: boolean;
  holderId: string | null;
}

/** User-agnostic snapshot stored in Redis under seatmap:{eventId}. */
export interface CachedSeatMap {
  event: Omit<EventSummary, 'availableCount'>;
  seats: CachedSeat[];
}

export function toSeatMapCache(
  event: Event & { seats: Seat[] },
  holdValues: (string | null)[],
): CachedSeatMap {
  return {
    event: {
      id: event.id,
      name: event.name,
      venueName: event.venueName,
      startsAt: event.startsAt.toISOString(),
      salesOpenAt: event.salesOpenAt.toISOString(),
      status: event.status,
    },
    seats: event.seats.map((seat, index) => {
      const value = holdValues[index];
      return {
        id: seat.id,
        rowLabel: seat.rowLabel,
        seatNumber: seat.seatNumber,
        priceCents: seat.priceCents,
        sold: seat.status === SeatStatus.sold,
        holderId: value ? holderIdOf(value) : null,
      };
    }),
  };
}

function stateOf(seat: CachedSeat, viewerId: string | null): SeatState {
  if (seat.sold) return 'sold';
  if (seat.holderId === null) return 'available';
  return viewerId !== null && seat.holderId === viewerId ? 'held_by_me' : 'held';
}

export function personaliseSeatMap(cache: CachedSeatMap, viewerId: string | null): EventDetail {
  const seats = cache.seats.map(
    (seat): SeatView => ({
      id: seat.id,
      rowLabel: seat.rowLabel,
      seatNumber: seat.seatNumber,
      priceCents: seat.priceCents,
      state: stateOf(seat, viewerId),
    }),
  );
  return {
    ...cache.event,
    availableCount: seats.filter((seat) => seat.state === 'available').length,
    seats,
  };
}
