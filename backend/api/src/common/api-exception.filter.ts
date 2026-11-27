import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Error codes from the API contract (see src/openapi/schemas.ts ERROR_CODES). */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'MODULE_NOT_IN_PLAN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NOT_ALLOWED_IN_STATE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'SERVICE_UNAVAILABLE';

/** Throw this from handlers to return a contract error. */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message, status);
  }
}

const DEFAULT_CODES: Partial<Record<number, ApiErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Turns every error into the contract envelope: { success: false, message, error: { code, fields?, requestId } }. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ApiErrorCode = 'INTERNAL';
    let message = 'Something went wrong';
    let fields: Record<string, string> | undefined;

    if (exception instanceof ApiError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      fields = exception.fields;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = DEFAULT_CODES[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED');
      const body = exception.getResponse();
      const raw = typeof body === 'string' ? body : (body as { message?: string | string[] }).message;
      message = status >= 500 ? message : Array.isArray(raw) ? raw.join('; ') : raw ?? exception.message;
      if (status === 429) message = 'Too many requests, try again later';
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.originalUrl} ${req.requestId ?? ''}`, exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      success: false,
      message,
      error: { code, ...(fields ? { fields } : {}), ...(req.requestId ? { requestId: req.requestId } : {}) },
    });
  }
}
