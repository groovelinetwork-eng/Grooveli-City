import { useLayoutEffect, type ReactNode } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import type { LabelPortal } from '../labels';
import type { Station } from '../../app/interiors';

/**
 * Wraps a station's 3D object: pointer cursor, hover label (contextual, never
 * permanent) and click-to-open. Shared by the apartment and the HQ.
 */
export function Interactive({
  station,
  active,
  labels,
  labelPortal,
  labelAt,
  onPick,
  onHover,
  children,
}: {
  station: Station;
  active: boolean;
  labels: boolean;
  labelPortal: LabelPortal;
  labelAt: [number, number, number];
  onPick: (s: Station) => void;
  onHover: (id: string | null) => void;
  children: ReactNode;
}) {
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 6) return; // drag-to-pan, not a click
        e.stopPropagation();
        onPick(station);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        onHover(station.id);
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
        onHover(null);
      }}
    >
      {children}
      {active && labels ? (
        <Html portal={labelPortal} position={labelAt} center zIndexRange={[10, 0]} className="label label-station" aria-hidden="true">
          {station.icon} {station.label} <kbd>E</kbd>
        </Html>
      ) : null}
    </group>
  );
}

/** Sets a texture as the scene background while mounted. */
export function SceneBackground({ texture }: { texture: THREE.Texture }) {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const prev = scene.background;
    scene.background = texture;
    return () => {
      scene.background = prev;
    };
  }, [scene, texture]);
  return null;
}
