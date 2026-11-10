'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { createInitialState, STATE_VERSION, type DemoState } from './state';

export const STORAGE_KEY = 'grooveli.demo.v1';

/**
 * Mock "backend" for demo mode. State lives ONLY in this browser's
 * localStorage. It is not a database, not shared between users and not secure.
 */
export const useDemoStore = create<DemoState>()(
  persist(() => createInitialState(), {
    name: STORAGE_KEY,
    version: STATE_VERSION,
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
    // Untrusted boundary: discard persisted state that doesn't match our shape.
    merge: (persisted, current) => {
      // Validate the shape only; merge the ORIGINAL object (zod would strip
      // unknown nested keys from the parsed copy — see TEST_REPORT D-005).
      const shape = z
        .object({
          stateVersion: z.literal(STATE_VERSION),
          candidate: z.object({ id: z.string(), preferences: z.object({ minSalary: z.number() }).passthrough() }).passthrough(),
          jobs: z.array(z.unknown()),
          workspaces: z.array(z.unknown()),
        })
        .passthrough();
      return shape.safeParse(persisted).success ? { ...current, ...(persisted as Partial<DemoState>) } : current;
    },
    migrate: () => createInitialState(),
  }),
);

export function resetDemoData() {
  const session = useDemoStore.getState().session;
  useDemoStore.setState({ ...createInitialState(), session }, true);
}

let hydrationStarted = false;

/** True once persisted demo state has loaded on the client. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useDemoStore.persist?.hasHydrated?.() ?? false);
  useEffect(() => {
    const unsub = useDemoStore.persist.onFinishHydration(() => setHydrated(true));
    if (!hydrationStarted) {
      hydrationStarted = true;
      void useDemoStore.persist.rehydrate();
    } else if (useDemoStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);
  return hydrated;
}

export function updateState(fn: (s: DemoState) => Partial<DemoState>) {
  useDemoStore.setState((s) => fn(s));
}
