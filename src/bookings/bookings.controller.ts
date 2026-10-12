import { Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { BookingResult, BookingsService, HoldResponse } from './bookings.service';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('events/:eventId')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('seats/:seatId/hold')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  hold(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<HoldResponse> {
    return this.bookings.holdSeat(eventId, seatId, user);
  }

  @Delete('seats/:seatId/hold')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  release(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.bookings.releaseSeat(eventId, seatId, user);
  }

  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  confirm(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingResult> {
    return this.bookings.confirm(eventId, user);
  }
}
