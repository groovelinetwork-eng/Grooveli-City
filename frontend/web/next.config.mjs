import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const CITY_DEV_ORIGIN = process.env.CITY_DEV_ORIGIN || 'http://localhost:3001';

const nextConfig = {
  transpilePackages: ['@grooveli/shared', '@grooveli/frontend-domain'],
  poweredByHeader: false,
  // Monorepo root (pnpm workspace) for output file tracing.
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '../..'),

  // Proxy /city to the Vite city app (served under base path /city/).
  // This keeps web and city same-origin in local dev; production routing is an
  // open decision (see docs/DECISION_LOG.md D8).
  async rewrites() {
    return [
      { source: '/city', destination: `${CITY_DEV_ORIGIN}/city/` },
      { source: '/city/:path*', destination: `${CITY_DEV_ORIGIN}/city/:path*` },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
