import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ResponseObject,
  ResponsesObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { APP_VERSION } from '@grooveli/shared';
import { Schema, int, obj, ref, str } from './schema-helpers';
import { schemas, ERROR_CODES } from './schemas';
import { PATH_PARAMS, Route, TAGS, routes } from './routes';

export const API_PREFIX = 'api/v1';
export const SESSION_COOKIE = 'grooveli_session';

const DESCRIPTION = `
REST API for Grooveli City — career, workplace and social ecosystems.

## Conventions
- **Base URL:** \`/api/v1\`. All paths below are relative to it.
- **Envelope:** every response (except **Games**) is \`{ success, data, message }\`. Errors are
  \`{ success: false, message, error: { code, fields?, requestId? } }\`.
- **Error codes:** ${Object.entries(ERROR_CODES).map(([c, s]) => `\`${c}\` (${s})`).join(', ')}.
- **Lists:** paginated lists return \`data: { items, page, pageSize, total }\` and accept \`?page=\` (default 1) and \`?pageSize=\` (default 20, max 100).
- **Formats:** dates are \`YYYY-MM-DD\`, timestamps are ISO-8601 UTC, money is whole naira (NGN) per month.
- **"Me" endpoints** never take a user ID; the user comes from the session.

## Authentication
Session cookie \`${SESSION_COOKIE}\` — \`HttpOnly; Secure; SameSite=Lax; Path=/\`, 14-day sliding expiry, rotated on sign-in and privilege change.
Browsers must send \`credentials: 'include'\`. For every non-GET request the server checks the \`Origin\` header against the CORS allowlist (CSRF protection).

## Authorisation
Operations under \`/orgs/{orgId}\` check the caller's roles in that organisation on **every call** (frontend checks are UX only).
The required permission is shown as **Access** and in \`x-permissions\`; the module the plan must include is in \`x-module\`
(403 \`MODULE_NOT_IN_PLAN\` otherwise). Source of truth for the role matrix: \`frontend/domain/src/permissions.ts\`.

| Plan | Modules |
|---|---|
| starter | recruitment, hr |
| growth | recruitment, hr, payroll, engagement |
| enterprise | recruitment, hr, payroll, engagement, analytics |

## Rate limits
Default 120 requests/minute per session (60/min per IP when signed out). Stricter limits are noted per operation.
Over the limit returns 429 \`RATE_LIMITED\` with \`Retry-After\`.

## Rules the backend enforces
- Job matching never uses personality traits, gender or photos.
- XP is awarded once per reason where it applies; the backend decides every award.
- No applying to a closed job or applying twice. A withdrawn application's status cannot change.
- At least one active org-admin always remains.
- Payroll is preview only — never a payment or a filing; \`simulated\` is always \`true\`.
- Anonymous surveys and feedback never reveal who sent them.
- Blocking removes the connection and blocks invitations and messages both ways.
- The AI assistant never submits applications without the confirm call.

## Real-time presence (WebSocket)
\`wss://<host>/api/v1/realtime/presence\` — signs in with the session cookie; the \`Origin\` must be an allowed web origin (401/403 otherwise).
- Client → server: \`{ "type": "update", "district", "position": { "x", "z" }, "status": "exploring" | "at-event" | "in-building" | "idle" }\` — at most 2 accepted per second.
- Server → client: \`{ "type": "snapshot", "players": PresenceProjection[] }\` on connect, \`{ "type": "presence", "player": PresenceProjection }\`, \`{ "type": "leave", "id" }\`, \`{ "type": "error", "message" }\`.
- Who sees whom follows \`presenceVisibility\` (everyone / connections / hidden) and blocks.

Operations marked **[added]** were not in the frontend's original list and were added for production.
`.trim();

// ── Responses ────────────────────────────────────────────────────────────────
const requestIdHeader = {
  'X-Request-Id': { description: 'Unique request ID (also accepted on the request for tracing)', schema: str() },
};

const errorResponse = (description: string, example: { code: string; message: string; fields?: Record<string, string> }): ResponseObject => ({
  description,
  headers: requestIdHeader,
  content: {
    'application/json': {
      schema: ref('ApiError'),
      example: { success: false, message: example.message, error: { code: example.code, ...(example.fields ? { fields: example.fields } : {}), requestId: 'req_01J9Z…' } },
    },
  },
});

const responses: Record<string, ResponseObject> = {
  BadRequest: errorResponse('Validation failed', { code: 'VALIDATION_FAILED', message: 'Title is required', fields: { title: 'Required' } }),
  Unauthenticated: errorResponse('Not signed in, or the session expired', { code: 'UNAUTHENTICATED', message: 'Please sign in' }),
  Forbidden: errorResponse('Missing permission (FORBIDDEN) or the organisation\'s plan lacks the module (MODULE_NOT_IN_PLAN)', { code: 'FORBIDDEN', message: 'You do not have permission to do this' }),
  NotFound: errorResponse('Not found, or not visible to the caller', { code: 'NOT_FOUND', message: 'Not found' }),
  Conflict: errorResponse('Conflicts with existing data (CONFLICT) or not allowed in the current state (NOT_ALLOWED_IN_STATE)', { code: 'CONFLICT', message: 'Already exists' }),
  PayloadTooLarge: errorResponse('File too large', { code: 'PAYLOAD_TOO_LARGE', message: 'The file is larger than the limit' }),
  UnsupportedMediaType: errorResponse('File type not allowed', { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'This file type is not allowed' }),
  RateLimited: {
    ...errorResponse('Too many requests', { code: 'RATE_LIMITED', message: 'Too many requests, try again later' }),
    headers: { ...requestIdHeader, 'Retry-After': { description: 'Seconds to wait', schema: int() } },
  },
  ServerError: errorResponse('Unexpected error', { code: 'INTERNAL', message: 'Something went wrong' }),
};

const r = (name: string) => ({ $ref: `#/components/responses/${name}` });

// ── Parameters ───────────────────────────────────────────────────────────────
const parameters: Record<string, ParameterObject> = {
  page: { name: 'page', in: 'query', schema: int({ minimum: 1, default: 1 }) },
  pageSize: { name: 'pageSize', in: 'query', schema: int({ minimum: 1, maximum: 100, default: 20 }) },
  idempotencyKey: {
    name: 'Idempotency-Key', in: 'header', required: false,
    description: 'Client-generated UUID. Retrying with the same key within 24 h returns the original result instead of creating a duplicate.',
    schema: str({ format: 'uuid' }),
  },
};

function pathParam(name: string): ParameterObject {
  let schema: Schema = str({ minLength: 1, maxLength: 64 });
  if (name === 'moduleIndex') schema = int({ minimum: 0 });
  if (name === 'gameId') schema = ref('GameId');
  if (name === 'tier') schema = ref('SubscriptionTier');
  if (name === 'token') schema = str({ minLength: 16, maxLength: 256 });
  return { name, in: 'path', required: true, description: PATH_PARAMS[name] ?? name, schema };
}

// ── Operations ───────────────────────────────────────────────────────────────
function accessText(route: Route): string {
  const a = route.access;
  const base =
    a === 'public' ? 'Public' :
    a === 'optional' ? 'Public; personalised when signed in' :
    a === 'user' ? 'Signed in' :
    a === 'platform' ? 'Grooveli platform admin' :
    a === 'member' ? 'Active member of the organisation' :
    a === 'org-admin' ? 'org-admin role' :
    Array.isArray(a) ? a.map((p) => `\`${p}\``).join(' or ') : `\`${a}\``;
  return route.accessNote ? `${base} (${route.accessNote})` : base;
}

function security(route: Route): Record<string, string[]>[] {
  if (route.access === 'public') return [];
  if (route.access === 'optional') return [{}, { cookieAuth: [] }];
  return [{ cookieAuth: [] }];
}

function successSchema(route: Route): Schema {
  if (route.page) {
    const data = obj({ items: { type: 'array', items: route.page }, page: int(), pageSize: int(), total: int() });
    return { allOf: [ref('ApiSuccess'), obj({ data })] };
  }
  const data: Schema = route.returns === undefined || route.returns === null ? { nullable: true, example: null } as Schema : route.returns;
  if (route.raw) return data;
  return { allOf: [ref('ApiSuccess'), obj({ data })] };
}

function buildOperation(route: Route): OperationObject {
  const pathNames = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const params: (ParameterObject | { $ref: string })[] = pathNames.map(pathParam);
  if (route.page) params.push({ $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' });
  for (const [name, schema] of Object.entries(route.query ?? {})) {
    params.push({ name, in: 'query', required: route.requiredQuery?.includes(name) ?? false, schema });
  }
  if (route.idempotent) params.push({ $ref: '#/components/parameters/idempotencyKey' });

  const lines = [`**Access:** ${accessText(route)}`];
  if (route.module) lines.push(`**Module:** \`${route.module}\``);
  if (route.rateLimit) lines.push(`**Rate limit:** ${route.rateLimit}`);
  if (route.cache) lines.push(`**Cache:** \`${route.cache}\``);
  if (route.conflict) lines.push(`**409 CONFLICT:** ${route.conflict}`);
  if (route.state) lines.push(`**409 NOT_ALLOWED_IN_STATE:** ${route.state}`);
  if (route.description) lines.push('', route.description);

  const status = String(route.status ?? 200);
  const successHeaders: Record<string, object> = { ...requestIdHeader };
  if (route.setsCookie) successHeaders['Set-Cookie'] = { description: `Sets or clears \`${SESSION_COOKIE}\``, schema: str() };
  if (route.cache) successHeaders['Cache-Control'] = { schema: str({ example: route.cache }) };

  const res: ResponsesObject = {
    [status]: {
      description: route.raw ? 'OK (not enveloped)' : 'OK',
      headers: successHeaders,
      content: { 'application/json': { schema: successSchema(route) } },
    },
  };
  if (params.length || route.body || route.multipart) res['400'] = r('BadRequest');
  if (route.access !== 'public' && route.access !== 'optional') res['401'] = r('Unauthenticated');
  if (!['public', 'optional', 'user'].includes(route.access as string) || route.module || route.accessNote) res['403'] = r('Forbidden');
  if (pathNames.length) res['404'] = r('NotFound');
  if (route.conflict || route.state) res['409'] = r('Conflict');
  if (route.multipart) {
    res['413'] = r('PayloadTooLarge');
    res['415'] = r('UnsupportedMediaType');
  }
  res['429'] = r('RateLimited');
  res['500'] = r('ServerError');

  const op: OperationObject = {
    operationId: route.operationId,
    summary: route.added ? `${route.summary} [added]` : route.summary,
    description: lines.join('\n\n'),
    tags: [route.tag],
    security: security(route),
    parameters: params,
    responses: res,
  };

  if (route.body) {
    op.requestBody = { required: true, content: { 'application/json': { schema: route.body } } };
  } else if (route.multipart) {
    const m = route.multipart;
    op.requestBody = {
      required: true,
      description: `Max ${m.maxMb} MB. Allowed types: ${m.types.join(', ')}`,
      content: { 'multipart/form-data': { schema: obj(m.fields, { optional: Object.keys(m.fields).filter((k) => !m.required.includes(k)) }) } },
    };
  }

  const x = op as OperationObject & Record<string, unknown>;
  x['x-access'] = route.access;
  if (Array.isArray(route.access) || (typeof route.access === 'string' && route.access.includes('.'))) {
    x['x-permissions'] = Array.isArray(route.access) ? route.access : [route.access];
  }
  if (route.module) x['x-module'] = route.module;
  if (route.rateLimit) x['x-rate-limit'] = route.rateLimit;
  if (route.added) x['x-added'] = true;
  return op;
}

export function buildOpenApiDocument(): OpenAPIObject {
  const seen = new Set<string>();
  const paths: Record<string, PathItemObject> = {};
  for (const route of routes) {
    if (seen.has(route.operationId)) throw new Error(`Duplicate operationId ${route.operationId}`);
    seen.add(route.operationId);
    const item = (paths[route.path] ??= {});
    if (item[route.method]) throw new Error(`Duplicate route ${route.method.toUpperCase()} ${route.path}`);
    item[route.method] = buildOperation(route);
  }

  const doc: OpenAPIObject & Record<string, unknown> = {
    openapi: '3.0.3',
    info: {
      title: 'Grooveli City API',
      version: APP_VERSION,
      description: DESCRIPTION,
      contact: { name: 'Grooveli engineering' },
    },
    servers: [
      { url: `/${API_PREFIX}`, description: 'This server' },
      {
        url: `{scheme}://{host}/${API_PREFIX}`,
        description: 'Any environment',
        variables: { scheme: { default: 'http', enum: ['http', 'https'] }, host: { default: 'localhost:4000' } },
      },
    ],
    tags: TAGS,
    paths,
    components: {
      schemas: {
        ApiSuccess: obj({ success: { type: 'boolean', enum: [true] }, message: str({ example: 'OK' }) }),
        ...schemas,
      } as OpenAPIObject['components'] extends infer C ? C extends { schemas?: infer S } ? S : never : never,
      responses,
      parameters,
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE, description: 'HttpOnly session cookie set by /auth/login and /auth/signup' },
      },
    },
    security: [{ cookieAuth: [] }],
  };
  return doc;
}

/** One-line-per-endpoint summary, used to generate ENDPOINTS.md. */
export function endpointTable(): string {
  const out: string[] = [];
  let tag = '';
  for (const route of routes) {
    if (route.tag !== tag) {
      tag = route.tag;
      out.push('', `## ${tag}`, '', '| Method | Path | Summary | Access | Module |', '|---|---|---|---|---|');
    }
    out.push(
      `| ${route.method.toUpperCase()} | \`${route.path}\` | ${route.summary}${route.added ? ' **[added]**' : ''} | ${accessText(route).replace(/\|/g, '\\|')} | ${route.module ?? ''} |`,
    );
  }
  return out.join('\n');
}
