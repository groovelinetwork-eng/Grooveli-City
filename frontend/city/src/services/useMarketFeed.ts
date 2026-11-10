import { useEffect, useMemo, useRef, useState } from 'react';
import type { MarketSnapshot } from '@grooveli/frontend-domain/public';
import { mockSnapshot, type MarketsAdapter } from './markets';

export type MarketFeedStatus = 'loading' | 'live' | 'demo' | 'fallback';

export interface MarketFeedState {
  snapshot: MarketSnapshot | null;
  status: MarketFeedStatus;
  /** Last error from the live feed (shown in the DOM panel, never on the board). */
  error: string | null;
}

/** A live snapshot older than this (beyond its stated delay) is replaced by labelled simulated data. */
const MAX_STALE_MS = 15 * 60 * 1000;

/**
 * Polls the market feed. Pauses while the tab is hidden and refreshes on
 * return; keeps the last good live snapshot through brief outages, then falls
 * back to clearly labelled simulated figures.
 */
export function useMarketFeed(adapter: MarketsAdapter, refreshMs: number, enabled = true): MarketFeedState {
  const [state, setState] = useState<MarketFeedState>({ snapshot: null, status: 'loading', error: null });
  const lastLive = useRef<MarketSnapshot | null>(null);
  const interval = useMemo(() => Math.max(15000, refreshMs), [refreshMs]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: number | undefined;
    let ctrl: AbortController | null = null;

    const load = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const snap = await adapter.fetchSnapshot(ctrl.signal);
        if (!alive) return;
        if (!snap.simulated) lastLive.current = snap;
        setState({ snapshot: snap, status: snap.simulated ? 'demo' : 'live', error: null });
      } catch (e) {
        if (!alive || ctrl.signal.aborted) return;
        const message = e instanceof Error ? e.message : 'Market feed unavailable';
        const live = lastLive.current;
        const age = live ? Date.now() - new Date(live.asOf).getTime() - live.delayedMinutes * 60000 : Infinity;
        if (live && age < MAX_STALE_MS) setState({ snapshot: live, status: 'live', error: message });
        else setState({ snapshot: mockSnapshot(new Date()), status: 'fallback', error: message });
      }
    };
    const schedule = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (!document.hidden) void load();
      }, interval);
    };
    const onVisible = () => {
      if (!document.hidden) void load();
    };

    void load();
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      ctrl?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [adapter, interval, enabled]);

  return state;
}
