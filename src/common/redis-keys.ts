export const holdKey = (eventId: string, seatId: string): string => `hold:${eventId}:${seatId}`;
export const userHoldsKey = (userId: string, eventId: string): string =>
  `holds:user:${userId}:${eventId}`;
export const seatMapKey = (eventId: string): string => `seatmap:${eventId}`;
export const refreshKey = (userId: string, jti: string): string => `refresh:${userId}:${jti}`;
export const eventChannel = (eventId: string): string => `events:${eventId}`;
export const EVENT_CHANNEL_PATTERN = 'events:*';

/** Value stored in a hold key: "{userId}:{holdToken}". */
export const holdValue = (userId: string, holdToken: string): string => `${userId}:${holdToken}`;
export const holderIdOf = (value: string): string => value.split(':')[0];
