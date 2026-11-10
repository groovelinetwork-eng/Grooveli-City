'use client';

import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';

export type ActionStatus = 'idle' | 'pending' | 'success' | 'error';

/**
 * Wraps an async service call with pending/success/error state and toasts.
 * Every mutation in the UI goes through this so loading and error states are
 * consistent.
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: { success?: string | ((r: R) => string | null); error?: string } = {},
) {
  const [status, setStatus] = useState<ActionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setStatus('pending');
      setError(null);
      try {
        const result = await fnRef.current(...args);
        setStatus('success');
        const s = optsRef.current.success;
        const message = typeof s === 'function' ? s(result) : s;
        if (message) toast.push({ tone: 'success', message });
        // Void services resolve to `true` so callers can branch on success.
        return (result === undefined ? (true as unknown as R) : result);
      } catch (e) {
        const message = e instanceof Error ? e.message : optsRef.current.error ?? 'Something went wrong.';
        setStatus('error');
        setError(message);
        toast.push({ tone: 'error', message });
        return undefined;
      }
    },
    [toast],
  );

  return { run, status, error, pending: status === 'pending', reset: () => setStatus('idle') };
}
