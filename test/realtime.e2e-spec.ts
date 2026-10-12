import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { createEvent, registerUser } from './setup/fixtures';
import { startTestApp, TestContext } from './setup/test-app';

function connect(baseUrl: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, { auth: { token }, transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitFor<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function join(socket: Socket, eventId: string): Promise<unknown> {
  return new Promise((resolve) => socket.emit('join_event', { eventId }, resolve));
}

describe('realtime gateway', () => {
  let ctx: TestContext;
  const sockets: Socket[] = [];
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await ctx.stop();
  });

  it('broadcasts held and sold to everyone in the event room', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 2 });
    const [seat] = event.seats;
    const alice = await registerUser(ctx.app, 'alice@test.dev');
    const bob = await registerUser(ctx.app, 'bob@test.dev');
    const a = await connect(ctx.baseUrl, alice.accessToken);
    const b = await connect(ctx.baseUrl, bob.accessToken);
    sockets.push(a, b);
    await Promise.all([join(a, event.id), join(b, event.id)]);

    const heldOnBoth = Promise.all([
      waitFor<{ type: string; seatIds: string[]; expiresAt: string }>(a, 'seat_update'),
      waitFor<{ type: string; seatIds: string[]; expiresAt: string }>(b, 'seat_update'),
    ]);
    await http().post(`/events/${event.id}/seats/${seat.id}/hold`).set('Authorization', `Bearer ${alice.accessToken}`);
    const held = { type: 'held', seatIds: [seat.id], expiresAt: expect.any(String) };
    expect(await heldOnBoth).toEqual([held, held]);

    const soldOnBoth = Promise.all([
      waitFor<{ type: string }>(a, 'seat_update'),
      waitFor<{ type: string }>(b, 'seat_update'),
    ]);
    await http().post(`/events/${event.id}/bookings`).set('Authorization', `Bearer ${alice.accessToken}`);
    const sold = { type: 'sold', seatIds: [seat.id] };
    expect(await soldOnBoth).toEqual([sold, sold]);
  });

  it('does not deliver updates for rooms the client has not joined', async () => {
    const event = await createEvent(ctx.prisma, { rows: 1, seatsPerRow: 1 });
    const user = await registerUser(ctx.app, 'quiet@test.dev');
    const socket = await connect(ctx.baseUrl, user.accessToken);
    sockets.push(socket);

    const unexpected = waitFor(socket, 'seat_update', 1000).then(
      () => 'received',
      () => 'timed out',
    );
    await http().post(`/events/${event.id}/seats/${event.seats[0].id}/hold`).set('Authorization', `Bearer ${user.accessToken}`);
    expect(await unexpected).toBe('timed out');
  });

  it('disconnects a client with a bad token', async () => {
    const socket = io(ctx.baseUrl, { auth: { token: 'garbage' }, transports: ['websocket'] });
    sockets.push(socket);
    const outcome = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('still connected'), 2000);
      const settle = (value: string) => {
        clearTimeout(timer);
        resolve(value);
      };
      socket.once('disconnect', () => settle('disconnected'));
      socket.once('connect_error', () => settle('disconnected'));
    });
    expect(outcome).toBe('disconnected');
  });
});
