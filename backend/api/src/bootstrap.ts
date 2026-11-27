import { HttpStatus } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { env } from './config/env';
import { API_PREFIX } from './openapi/document';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** HTTP pipeline shared by the server (main.ts) and the end-to-end tests. */
export function configureApp(app: NestExpressApplication) {
  const e = env();
  app.enableShutdownHooks();
  app.disable('x-powered-by');
  if (e.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(e.TRUST_PROXY) ? Number(e.TRUST_PROXY) : e.TRUST_PROXY);

  app.useBodyParser('json', { limit: '1mb' });
  app.use(cookieParser());
  // JSON API: no HTML to protect with CSP except Swagger UI, which needs inline styles.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Request ID for tracing; echoed on every response and in error bodies.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && /^[\w.-]{1,64}$/.test(incoming) ? incoming : `req_${randomUUID()}`;
    (req as Request & { requestId: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // CSRF protection for cookie auth: state-changing requests from a browser
  // must come from an allowed origin. Requests without Origin are not from a
  // cross-site browser context, and the API's own pages (Swagger UI) are
  // same-origin, so both are allowed.
  const sameOrigin = (origin: string, host: string | undefined) => {
    try {
      return !!host && new URL(origin).host === host;
    } catch {
      return false;
    }
  };
  app.use((req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (SAFE_METHODS.has(req.method) || !origin || e.corsOrigins.includes(origin) || sameOrigin(origin, req.header('host'))) return next();
    res.status(HttpStatus.FORBIDDEN).json({
      success: false,
      message: 'Origin not allowed',
      error: { code: 'FORBIDDEN', requestId: req.requestId },
    });
  });

  app.enableCors({ origin: e.corsOrigins, credentials: true, exposedHeaders: ['X-Request-Id', 'Retry-After'] });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
