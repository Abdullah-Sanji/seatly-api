import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { AppException, ErrorBody } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code.enum';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  429: ErrorCode.RATE_LIMITED,
};

export function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof AppException) {
    return exception.getResponse() as ErrorBody;
  }
  if (exception instanceof ThrottlerException) {
    return { statusCode: 429, code: ErrorCode.RATE_LIMITED, message: 'Too many requests', details: {} };
  }
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const rawMessage =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ?? exception.message);
    if (statusCode === 400 && Array.isArray(rawMessage)) {
      return {
        statusCode,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        details: { errors: rawMessage },
      };
    }
    const code =
      statusCode >= 500 ? ErrorCode.INTERNAL : (CODE_BY_STATUS[statusCode] ?? ErrorCode.REQUEST_FAILED);
    return { statusCode, code, message: String(rawMessage), details: {} };
  }
  return { statusCode: 500, code: ErrorCode.INTERNAL, message: 'Internal server error', details: {} };
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = toErrorBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(body.statusCode).json(body);
  }
}
