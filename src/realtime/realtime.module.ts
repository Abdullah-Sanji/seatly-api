import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventPublisher } from './event-publisher';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule],
  providers: [EventPublisher, RealtimeGateway],
  exports: [EventPublisher],
})
export class RealtimeModule {}
