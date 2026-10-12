import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../auth.types';

/** Sets req.user when a valid bearer token is present; never rejects the request. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthUser | null>(_err: unknown, user: AuthUser | false): TUser {
    return (user || null) as TUser;
  }
}
