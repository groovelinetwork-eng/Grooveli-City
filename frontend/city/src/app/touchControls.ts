import { useEffect, useState } from 'react';
import type { CitySettings } from './settings';

/**
 * Adaptive touch controls. Decided from input capabilities and actual input,
 * never from the user agent:
 * - primary pointer is coarse (phones, tablets)            → show
 * - touch-capable but fine primary pointer (touch laptops) → show after a touch,
 *   hide again once the keyboard or mouse is used
 * - no touch capability (ordinary desktops)                → hide
 * The setting can force them on or off.
 */
export type LastInput = 'touch' | 'mouse' | 'keyboard' | null;

export interface InputCapabilities {
  primaryCoarse: boolean;
  anyTouch: boolean;
}

export function decideTouchControls(setting: CitySettings['touchControls'], caps: InputCapabilities, last: LastInput): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  if (caps.primaryCoarse) return true;
  return caps.anyTouch && last === 'touch';
}

/** Phone vs tablet layout from the viewport's short side (both orientations). */
export function touchLayout(width: number, height: number): 'phone' | 'tablet' {
  return Math.min(width, height) < 600 ? 'phone' : 'tablet';
}

function readCaps(): InputCapabilities {
  if (typeof window === 'undefined') return { primaryCoarse: false, anyTouch: false };
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
  return {
    primaryCoarse: mq('(pointer: coarse)'),
    anyTouch: mq('(any-pointer: coarse)') || (navigator.maxTouchPoints ?? 0) > 0,
  };
}

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function useTouchControls(setting: CitySettings['touchControls']) {
  const [caps, setCaps] = useState(readCaps);
  const [last, setLast] = useState<LastInput>(null);
  const [size, setSize] = useState(() => ({ w: typeof window === 'undefined' ? 1280 : window.innerWidth, h: typeof window === 'undefined' ? 800 : window.innerHeight }));

  useEffect(() => {
    const queries = ['(pointer: coarse)', '(any-pointer: coarse)'].map((q) => window.matchMedia?.(q)).filter(Boolean) as MediaQueryList[];
    const onCaps = () => setCaps(readCaps());
    queries.forEach((q) => q.addEventListener?.('change', onCaps));
    const onPointer = (e: PointerEvent) => setLast(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse');
    const onKey = (e: KeyboardEvent) => {
      if (MOVE_CODES.has(e.code)) setLast('keyboard');
    };
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      queries.forEach((q) => q.removeEventListener?.('change', onCaps));
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return {
    show: decideTouchControls(setting, caps, last),
    layout: touchLayout(size.w, size.h),
    orientation: size.w >= size.h ? ('landscape' as const) : ('portrait' as const),
  };
}
