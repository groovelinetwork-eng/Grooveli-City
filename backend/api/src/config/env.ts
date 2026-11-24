import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  TRUST_PROXY: z.string().optional(),
  SWAGGER_ENABLED: bool(true),

  /** Public URL of the web app, used in email links. */
  APP_URL: z.string().url().default('http://localhost:3000'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  /** Secure cookies; must be true in production (HTTPS). */
  COOKIE_SECURE: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  PASSWORD_BREACH_CHECK: z.string().optional(),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Grooveli City <no-reply@grooveli.local>'),

  /** Secret for one-way markers (e.g. "has answered this anonymous survey"). Long random value in production. */
  HASH_SECRET: z.string().min(16).default('grooveli-dev-hash-secret-change-me'),

  /** Comma-separated words/phrases refused in community posts and messages (managed by Trust & Safety). */
  CONTENT_BLOCKLIST: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)),

  /** Claude API key for the AI career assistant. Unset = assistant returns 503 "not configured". */
  ANTHROPIC_API_KEY: z.string().optional(),
  ASSISTANT_MODEL: z.string().default('claude-opus-5-5'),
  /** Markets billboard data source: "open-er-api" (FX rates, free, attribution) or unset (503). */
  MARKETS_PROVIDER: z.enum(['open-er-api']).optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('grooveli-files'),
  S3_ACCESS_KEY_ID: z.string().default('grooveli'),
  S3_SECRET_ACCESS_KEY: z.string().default('grooveli-dev-secret'),
  S3_FORCE_PATH_STYLE: bool(false),
  /** Ask S3 to encrypt objects at rest (AES-256). Enable on AWS S3. */
  S3_SSE: bool(false),
});

export type Env = z.infer<typeof schema> & {
  corsOrigins: string[];
  isProd: boolean;
  cookieSecure: boolean;
  breachCheck: boolean;
};

let cached: Env | null = null;

/** Validated environment. Fails fast at startup with every problem listed. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';
  const cookieSecure = e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : isProd;
  if (isProd && !cookieSecure) throw new Error('COOKIE_SECURE must be true in production');
  if (isProd && (e.S3_ACCESS_KEY_ID === 'grooveli' || e.S3_SECRET_ACCESS_KEY === 'grooveli-dev-secret')) {
    throw new Error('Set real S3 credentials in production');
  }
  if (isProd && e.HASH_SECRET.includes('change-me')) throw new Error('Set HASH_SECRET in production');
  cached = {
    ...e,
    corsOrigins: e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    isProd,
    cookieSecure,
    breachCheck: e.PASSWORD_BREACH_CHECK ? e.PASSWORD_BREACH_CHECK === 'true' : isProd,
  };
  return cached;
}
