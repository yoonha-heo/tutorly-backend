import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import {
  BusinessException,
  BusinessExceptionDetails,
  ErrorResponse,
} from '@/common/exceptions/business.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const header = request.headers['x-trace-id'];
    const traceId =
      typeof header === 'string' && header.length > 0
        ? header
        : Array.isArray(header) && header[0]
          ? header[0]
          : `req-${randomUUID().slice(0, 8)}`;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred.';
    let details: BusinessExceptionDetails | undefined;

    if (exception instanceof BusinessException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = exception.name;
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (isRecord(body)) {
        if (typeof body.code === 'string') {
          code = body.code;
        }
        if (typeof body.message === 'string') {
          message = body.message;
        } else if (
          Array.isArray(body.message) &&
          body.message.every((item) => typeof item === 'string')
        ) {
          message = body.message.join(', ');
        }
      }
    }

    const logMessage = `[${traceId}] ${code}: ${message}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack =
        exception instanceof Error ? exception.stack : String(exception);
      const cause = exception instanceof Error ? exception.cause : undefined;
      const causeStack = cause instanceof Error ? cause.stack : undefined;

      this.logger.error(
        logMessage,
        causeStack ? `${stack}\nCaused by: ${causeStack}` : stack,
      );
    } else {
      this.logger.warn(
        details ? `${logMessage} ${JSON.stringify(details)}` : logMessage,
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      code,
      message,
      details,
      traceId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
