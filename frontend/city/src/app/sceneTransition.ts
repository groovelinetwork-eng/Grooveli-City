import { useCallback, useEffect, useRef, useState } from 'react';
import type { InteriorKind } from './interiors';

/**
 * Door transition between the street and building interiors.
 *
 * Swapping scenes builds the new room (geometry, textures, shader programs)
 * in one blocking step. The transition hides that work:
 *   closing → doors slide shut over the old scene (DOM overlay)
 *   loading → only once the shut doors have been painted is the scene swapped;
 *             the overlay's shimmer is a transform animation, so the browser
 *             keeps animating it even while the main thread is busy
 *   opening → when the new scene has drawn its first complete frame
 *             (CityCanvas onSceneReady) the doors slide open onto it
 */
export type TransitionPhase = 'closing' | 'loading' | 'opening';

export interface TransitionInfo {
  direction: 'enter' | 'leave';
  title: string;
  subtitle: string;
  /** Accent colour (brand colour for company headquarters). */
  accent: string;
  /** Short badge text: brand initials or a symbol. */
  badge: string;
}

export interface TransitionState extends TransitionInfo {
  phase: TransitionPhase;
  id: number;
}

export const DOOR_CLOSE_MS = 280;
export const DOOR_OPEN_MS = 520;
/** Safety net: reveal anyway if the scene never reports a frame. */
export const MAX_LOAD_MS = 20000;

function initials(name: string) {
  const words = name.replace(/\b(HQ|Headquarters)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

export function enterInfo(buildingName: string, kind: InteriorKind, org?: { name: string; logoColor: string } | null): TransitionInfo {
  if (kind === 'apartment') return { direction: 'enter', title: 'Your apartment', subtitle: 'Home · career headquarters', accent: '#f59e0b', badge: '⌂' };
  if (kind === 'ai-center') return { direction: 'enter', title: 'AI Career Center', subtitle: 'Guidance · CV help · interview practice', accent: '#8b5cf6', badge: '✦' };
  return {
    direction: 'enter',
    title: org?.name ?? buildingName,
    subtitle: 'Company headquarters',
    accent: org?.logoColor ?? '#22d3ee',
    badge: initials(org?.name ?? buildingName),
  };
}

export function leaveInfo(placeName: string): TransitionInfo {
  return { direction: 'leave', title: 'Back to the street', subtitle: placeName, accent: '#22d3ee', badge: '↩' };
}

export function useSceneTransition(reducedMotion: boolean) {
  const [state, setState] = useState<TransitionState | null>(null);
  const current = useRef<TransitionState | null>(null);
  const timers = useRef<number[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    current.current = state;
  }, [state]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const reveal = useCallback(
    (id: number) => {
      setState((s) => (s && s.id === id && s.phase === 'loading' ? { ...s, phase: 'opening' } : s));
      timers.current.push(window.setTimeout(() => setState((s) => (s && s.id === id ? null : s)), reducedMotion ? 0 : DOOR_OPEN_MS));
    },
    [reducedMotion],
  );

  /** Closes the doors, runs `swap` once they are painted shut, then waits for sceneReady(). */
  const start = useCallback(
    (info: TransitionInfo, swap: () => void) => {
      clearTimers();
      const id = ++seq.current;
      setState({ ...info, phase: reducedMotion ? 'loading' : 'closing', id });
      const go = () =>
        // two frames: the fully shut doors are on screen before the blocking swap starts
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setState((s) => (s && s.id === id ? { ...s, phase: 'loading' } : s));
            swap();
            timers.current.push(window.setTimeout(() => reveal(id), MAX_LOAD_MS));
          }),
        );
      if (reducedMotion) go();
      else timers.current.push(window.setTimeout(go, DOOR_CLOSE_MS));
    },
    [reducedMotion, reveal],
  );

  /** Called by the canvas when the new scene has rendered its first complete frame. */
  const sceneReady = useCallback(() => {
    const s = current.current;
    if (s && s.phase === 'loading') reveal(s.id);
  }, [reveal]);

  /** Input is ignored while the doors are shut (closing / loading); it resumes as they open. */
  const blocking = state !== null && state.phase !== 'opening';
  return { state, active: state !== null, blocking, start, sceneReady };
}
