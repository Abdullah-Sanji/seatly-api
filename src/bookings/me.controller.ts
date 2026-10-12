import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingsService, MyBooking } from './bookings.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('bookings')
  myBookings(@CurrentUser() user: AuthUser): Promise<MyBooking[]> {
    return this.bookings.myBookings(user);
  }
}
