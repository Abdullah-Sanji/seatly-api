import {
  EVENT_CHANNEL_PATTERN,
  eventChannel,
  holdKey,
  holdValue,
  holderIdOf,
  refreshKey,
  seatMapKey,
  userHoldsKey,
} from './redis-keys';

describe('redis keys', () => {
  it('builds the keys named in the spec', () => {
    expect(holdKey('e1', 's1')).toBe('hold:e1:s1');
    expect(userHoldsKey('u1', 'e1')).toBe('holds:user:u1:e1');
    expect(seatMapKey('e1')).toBe('seatmap:e1');
    expect(refreshKey('u1', 'j1')).toBe('refresh:u1:j1');
    expect(eventChannel('e1')).toBe('events:e1');
    expect(EVENT_CHANNEL_PATTERN).toBe('events:*');
  });

  it('encodes and decodes the hold value', () => {
    const value = holdValue('u1', 'tok');
    expect(value).toBe('u1:tok');
    expect(holderIdOf(value)).toBe('u1');
  });
});
