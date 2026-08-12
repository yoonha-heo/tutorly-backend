import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
    constructor(
        public readonly code: string,
        message: string,
        status: HttpStatus = HttpStatus.BAD_REQUEST,
        public readonly details?: Record<string, any>,
    ) {
        super({ code, message, details }, status);
    }
}