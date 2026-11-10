import { buildWebUrl, type CityIntent, type DistrictId } from '@grooveli/frontend-domain/public';
import { cityConfig } from './config';
import type { Quality } from '../world/ambient';

export interface CitySettings {
  quality: Quality['level'];
  timeOfDay: 'auto' | 'day' | 'night';
  reducedMotion: boolean;
  labels: boolean;
  joystick: boolean;
  /** Turn the camera to show entrances hidden from the current view. */
  cameraAssist: boolean;
}

const KEY = 'grooveli.city-settings.v1';

export function defaultSettings(): CitySettings {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const lowEnd = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4;
  return { quality: coarse || lowEnd ? 'low' : 'medium', timeOfDay: 'auto', reducedMotion: !!reduced, labels: true, joystick: !!coarse, cameraAssist: true };
}

export function loadSettings(): CitySettings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<CitySettings>;
    return {
      quality: ['low', 'medium', 'high'].includes(parsed.quality as string) ? (parsed.quality as CitySettings['quality']) : base.quality,
      timeOfDay: ['auto', 'day', 'night'].includes(parsed.timeOfDay as string) ? (parsed.timeOfDay as CitySettings['timeOfDay']) : base.timeOfDay,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : base.reducedMotion,
      labels: typeof parsed.labels === 'boolean' ? parsed.labels : base.labels,
      joystick: typeof parsed.joystick === 'boolean' ? parsed.joystick : base.joystick,
      cameraAssist: typeof parsed.cameraAssist === 'boolean' ? parsed.cameraAssist : base.cameraAssist,
    };
  } catch {
    return base;
  }
}

export function saveSettings(s: CitySettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function isNight(s: CitySettings, now = new Date()): boolean {
  if (s.timeOfDay !== 'auto') return s.timeOfDay === 'night';
  const h = now.getHours();
  return h < 6 || h >= 19;
}

/** Canonical web URL for a city intent with safe return-to-city context. */
export function webHref(intent: CityIntent, district?: DistrictId | null): string {
  return buildWebUrl(cityConfig.webUrl, intent, { district });
}
