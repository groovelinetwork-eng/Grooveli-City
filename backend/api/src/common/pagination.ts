import { z } from 'zod';
import type { Page } from './responses';

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const skipTake = (q: PageQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export const toPage = <T>(items: T[], total: number, q: PageQuery): Page<T> => ({
  items,
  page: q.page,
  pageSize: q.pageSize,
  total,
});

/** Paginates an in-memory list (for results ranked in application code). */
export const pageOf = <T>(all: T[], q: PageQuery): Page<T> => toPage(all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), all.length, q);

/** YYYY-MM-DD for a Date (UTC). */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Today at 00:00 UTC, for comparing with @db.Date columns. */
export const todayUtc = () => new Date(`${isoDate(new Date())}T00:00:00.000Z`);

export const zIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');
