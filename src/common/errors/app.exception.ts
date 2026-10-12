import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: Record<string, unknown>;
}

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: HttpStatus,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    const body: ErrorBody = { statusCode: status, code, message, details };
    super(body, status);
  }
}
