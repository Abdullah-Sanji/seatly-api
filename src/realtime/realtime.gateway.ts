import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { EVENT_CHANNEL_PATTERN } from '../common/redis-keys';
import { REDIS_SUBSCRIBER } from '../redis/redis.constants';
import { EventMessage } from './messages';

const CHANNEL_PREFIX = 'events:';
export const roomName = (eventId: string): string => `event:${eventId}`;

interface JoinPayload {
  eventId: string;
}

// origin: true reflects the request origin; fine for a playground where the API is not public.
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly auth: AuthService,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscriber.psubscribe(EVENT_CHANNEL_PATTERN);
    this.subscriber.on('pmessage', (_pattern: string, channel: string, raw: string) => {
      const eventId = channel.slice(CHANNEL_PREFIX.length);
      const message = JSON.parse(raw) as EventMessage;
      const eventName = message.type === 'sales_opened' ? 'sales_opened' : 'seat_update';
      this.server.to(roomName(eventId)).emit(eventName, message);
    });
  }

  // No unsubscribe on destroy: RedisModule quits the subscriber connection, which drops every subscription.

  async handleConnection(client: Socket): Promise<void> {
    const token = (client.handshake.auth as { token?: string }).token ?? '';
    try {
      const user: AuthUser = await this.auth.verifyAccessToken(token);
      client.data.user = user;
    } catch {
      this.logger.debug(`Rejected socket ${client.id}: bad token`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join_event')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: JoinPayload): Promise<{ joined: string }> {
    await client.join(roomName(body.eventId));
    return { joined: body.eventId };
  }

  @SubscribeMessage('leave_event')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: JoinPayload): Promise<{ left: string }> {
    await client.leave(roomName(body.eventId));
    return { left: body.eventId };
  }
}
