import { HttpStatus, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AuthService } from '../auth.service';
import { AuthUser } from '../auth.types';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<AuthUser> {
    const user = await this.auth.validateUser(email, password);
    if (!user) {
      throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, 'Invalid credentials');
    }
    return user;
  }
}
