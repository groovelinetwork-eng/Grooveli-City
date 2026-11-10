import { useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { DirectionalLight } from 'three';
import type { Vec2 } from '../world/layout';

/**
 * Warm sun from the north-west (reference shadows fall to the lower right).
 * The shadow frustum follows the camera focus, snapped to a 2 m grid so
 * shadow edges don't shimmer while walking.
 */
export function Sun({ focus, night, shadows, mapSize }: { focus: MutableRefObject<Vec2>; night: boolean; shadows: boolean; mapSize: number }) {
  const light = useRef<DirectionalLight>(null);
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -70;
    cam.right = 70;
    cam.top = 60;
    cam.bottom = -60;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.04;
  }, [mapSize]);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const x = Math.round(focus.current.x / 2) * 2;
    const z = Math.round(focus.current.z / 2) * 2;
    l.position.set(x - 45, 85, z - 30);
    l.target.position.set(x, 0, z + 4);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      intensity={night ? 0.75 : 2.6}
      color={night ? '#c7d2fe' : '#fff1d6'}
      castShadow={shadows}
      shadow-mapSize={[mapSize || 1024, mapSize || 1024]}
    />
  );
}
