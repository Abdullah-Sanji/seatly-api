import { Event, EventStatus, Seat, SeatStatus } from '@prisma/client';
import { personaliseSeatMap, toSeatMapCache } from './seat-map';

const event: Event = {
  id: 'e1',
  name: 'Show',
  venueName: 'Hall',
  startsAt: new Date('2026-11-01T19:00:00Z'),
  salesOpenAt: new Date('2026-10-01T09:00:00Z'),
  status: EventStatus.on_sale,
};

function seat(id: string, status: SeatStatus = SeatStatus.available): Seat {
  return { id, eventId: 'e1', rowLabel: 'A', seatNumber: Number(id.slice(1)), priceCents: 100, status };
}

describe('toSeatMapCache', () => {
  it('records sold flags and holder ids from the hold values', () => {
    const cache = toSeatMapCache({ ...event, seats: [seat('s1'), seat('s2', SeatStatus.sold), seat('s3')] }, [
      'u9:token',
      null,
      null,
    ]);
    expect(cache.event).toEqual({
      id: 'e1',
      name: 'Show',
      venueName: 'Hall',
      startsAt: '2026-11-01T19:00:00.000Z',
      salesOpenAt: '2026-10-01T09:00:00.000Z',
      status: 'on_sale',
    });
    expect(cache.seats.map((s) => [s.id, s.sold, s.holderId])).toEqual([
      ['s1', false, 'u9'],
      ['s2', true, null],
      ['s3', false, null],
    ]);
  });
});

describe('personaliseSeatMap', () => {
  const cache = toSeatMapCache(
    { ...event, seats: [seat('s1'), seat('s2', SeatStatus.sold), seat('s3'), seat('s4')] },
    ['u9:token', null, 'u1:token', null],
  );

  it('marks the viewer’s own holds as held_by_me and others as held', () => {
    const detail = personaliseSeatMap(cache, 'u1');
    expect(detail.seats.map((s) => s.state)).toEqual(['held', 'sold', 'held_by_me', 'available']);
    expect(detail.availableCount).toBe(1);
  });

  it('shows every hold as held for an anonymous viewer', () => {
    const detail = personaliseSeatMap(cache, null);
    expect(detail.seats.map((s) => s.state)).toEqual(['held', 'sold', 'held', 'available']);
  });

  it('never leaks holder ids', () => {
    const detail = personaliseSeatMap(cache, 'u1');
    expect(JSON.stringify(detail)).not.toContain('u9');
  });
});
