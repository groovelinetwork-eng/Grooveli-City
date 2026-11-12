import { createContext, useContext } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Object3D } from 'three';

/**
 * Scenes stay mounted while hidden (the street while you are inside a
 * building), so leaving a building is instant instead of rebuilding the city.
 * A hidden scene is frozen: its per-frame work stops (useActiveFrame), its
 * labels unmount, and its objects ignore pointer events (inHiddenScene).
 */
export const SceneActive = createContext(true);

export function useSceneActive() {
  return useContext(SceneActive);
}

type FrameCallback = Parameters<typeof useFrame>[0];

/** useFrame that only runs while the surrounding scene is active. */
export function useActiveFrame(callback: FrameCallback, priority?: number) {
  const active = useContext(SceneActive);
  useFrame((state, delta, frame) => {
    if (active) callback(state, delta, frame);
  }, priority);
}

/** userData key marking the root group of a mounted-but-hidden scene. */
export const HIDDEN_SCENE = 'hiddenScene';

export function inHiddenScene(o: Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (p.userData[HIDDEN_SCENE]) return true;
  return false;
}
