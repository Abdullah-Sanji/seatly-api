import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code.enum';
import { toErrorBody } from './app-exception.filter';

describe('toErrorBody', () => {
  it('passes an AppException through unchanged', () => {
    const body = toErrorBody(
      new AppException(ErrorCode.SEAT_HELD, HttpStatus.CONFLICT, 'Seat is held', { seatIds: ['s1'] }),
    );
    expect(body).toEqual({
      statusCode: 409,
      code: 'SEAT_HELD',
      message: 'Seat is held',
      details: { seatIds: ['s1'] },
    });
  });

  it('maps a ValidationPipe BadRequestException to VALIDATION_FAILED with the messages in details', () => {
    const body = toErrorBody(new BadRequestException(['email must be an email', 'password too short']));
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual({ errors: ['email must be an email', 'password too short'] });
  });

  it('maps 404 and 429 to their codes', () => {
    expect(toErrorBody(new NotFoundException()).code).toBe(ErrorCode.NOT_FOUND);
    expect(toErrorBody(new ThrottlerException()).code).toBe(ErrorCode.RATE_LIMITED);
    expect(toErrorBody(new ThrottlerException()).statusCode).toBe(429);
  });

  it('hides internals of unknown errors', () => {
    const body = toErrorBody(new Error('connection string leaked'));
    expect(body).toEqual({
      statusCode: 500,
      code: ErrorCode.INTERNAL,
      message: 'Internal server error',
      details: {},
    });
  });
});
