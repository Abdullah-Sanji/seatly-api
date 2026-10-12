import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser } from '../../auth/auth.types';

/** Rate-limits per authenticated user. Place it AFTER JwtAuthGuard in @UseGuards. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: { user?: AuthUser; ip: string }): Promise<string> {
    return req.user?.id ?? req.ip;
  }
}
