import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, URL-safe. */
export const newToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/** Truncate an IP for storage: /24 for IPv4, /48 for IPv6. */
export function truncateIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.split('.').slice(0, 3).concat('0').join('.');
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::';
  return null;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
