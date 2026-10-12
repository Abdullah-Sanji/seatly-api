export type SeatUpdateType = 'held' | 'released' | 'sold';

export interface SeatUpdateMessage {
  type: SeatUpdateType;
  seatIds: string[];
  expiresAt?: string;
}

export interface SalesOpenedMessage {
  type: 'sales_opened';
}

export type EventMessage = SeatUpdateMessage | SalesOpenedMessage;
