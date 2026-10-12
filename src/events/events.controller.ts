import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { EventsService } from './events.service';
import { EventDetail, EventSummary } from './seat-map';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(): Promise<EventSummary[]> {
    return this.events.listEvents();
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser | null,
  ): Promise<EventDetail> {
    return this.events.getEventDetail(id, user?.id ?? null);
  }
}
