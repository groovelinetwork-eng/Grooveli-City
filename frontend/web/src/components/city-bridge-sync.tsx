'use client';

import { useEffect } from 'react';
import {
  CITY_BRIDGE_STORAGE_KEY,
  makeCityBridge,
  progressFromXp,
  toPublicVacancy,
  totalXp,
  type CityBridgePayload,
} from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import type { DemoState } from '@/lib/store/state';

/** Public-only projection written for the city app (same-origin via /city proxy). */
export function buildBridge(s: DemoState): CityBridgePayload {
  const isCandidate = s.session?.personaId === 'candidate';
  const publicOrgUpdates: CityBridgePayload['publicOrgUpdates'] = {};
  for (const org of s.organizations) {
    const vacancies = s.jobs.filter((j) => j.organizationId === org.id && j.status === 'published').map(toPublicVacancy).slice(0, 100);
    const announcements = s.announcements
      .filter((a) => a.organizationId === org.id && a.audience === 'public-hq')
      .slice(0, 50)
      .map((a) => ({ id: a.id, title: a.title.slice(0, 140), body: a.body.slice(0, 1000), publishedAt: a.publishedAt }));
    publicOrgUpdates[org.id] = { vacancies, announcements };
  }
  const progress = isCandidate ? progressFromXp(totalXp(s.xp)) : null;
  return makeCityBridge({
    displayName: isCandidate ? s.candidate.displayName : null,
    level: progress ? progress.level : null,
    levelProgress: progress && progress.xpForNextLevel > 0 ? Math.min(1, progress.xpIntoLevel / progress.xpForNextLevel) : null,
    avatar: isCandidate ? s.candidate.avatar : null,
    publicOrgUpdates,
    now: new Date().toISOString(),
  });
}

export function CityBridgeSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const write = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(CITY_BRIDGE_STORAGE_KEY, JSON.stringify(buildBridge(useDemoStore.getState())));
        } catch {
          /* storage unavailable — city falls back to URL avatar + fixtures */
        }
      }, 200);
    };
    write();
    const unsub = useDemoStore.subscribe(write);
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);
  return null;
}
