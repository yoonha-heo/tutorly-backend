import { HttpException, HttpStatus } from '@nestjs/common';

export type BusinessExceptionDetails = Record<string, unknown>;

export type ErrorResponse = {
  statusCode: number;
  code: string;
  message: string;
  details?: BusinessExceptionDetails;
  traceId: string;
  timestamp: string;
  path: string;
};

export class BusinessException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: BusinessExceptionDetails,
    cause?: unknown,
  ) {
    super(
      { code, message, details },
      status,
      cause !== undefined ? { cause } : undefined,
    );
  }
}
