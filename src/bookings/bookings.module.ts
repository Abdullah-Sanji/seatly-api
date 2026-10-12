import { Module } from '@nestjs/common';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { EventsModule } from '../events/events.module';
import { HoldsModule } from '../holds/holds.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [EventsModule, HoldsModule, RealtimeModule],
  controllers: [BookingsController],
  providers: [BookingsService, UserThrottlerGuard],
})
export class BookingsModule {}
