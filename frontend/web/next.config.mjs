import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const CITY_DEV_ORIGIN = process.env.CITY_DEV_ORIGIN || 'http://localhost:3001';
const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === 'production' || isVercel;

const nextConfig = {
  transpilePackages: ['@grooveli/shared', '@grooveli/frontend-domain'],
  poweredByHeader: false,
  // Monorepo root (pnpm workspace) for output file tracing.
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '../..'),

  // In dev: proxy /city to Vite dev server.
  // In production / Vercel: city is built and served from public/city/ (static files).
  async rewrites() {
    if (isProduction || isVercel) {
      return [
        { source: '/city', destination: '/city/index.html' },
        { source: '/city/', destination: '/city/index.html' },
      ];
    }
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
