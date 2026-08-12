import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const traceId = (request.headers['x-trace-id'] as string) || `req-${Math.random().toString(36).substring(2, 9)}`;

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let code = 'INTERNAL_SERVER_ERROR';
        let message = 'An unexpected error occurred.';
        let details: any = undefined;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse() as any;

            if (typeof res === 'object') {
                code = res.code || exception.name;
                message = Array.isArray(res.message) ? res.message.join(', ') : res.message || message;
                details = res.details;
            } else if (typeof res === 'string') {
                message = res;
            }
        }

        response.status(status).json({
            statusCode: status,
            code,
            message,
            details,
            traceId,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}