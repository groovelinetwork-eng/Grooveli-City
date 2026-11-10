import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CityProps } from '../../world/props';
import { PLACED_BUILDINGS, groundHeight, type Vec2 } from '../../world/layout';
import { PLAZA_RING } from '../../world/plan';

/** Lamp head offset from the pole (Props.tsx lampHead: local (0, 4.48, 1)). */
const HEAD_Y = 4.4;
const HEAD_REACH = 1;

/** Ground positions of the lit lamp heads (same thinning rule as Props). */
export function lampHeads(props: CityProps, density: number): { x: number; y: number; z: number }[] {
  const lamps = density >= 1 ? props.lamps : props.lamps.filter((_, i) => (i * 7919) % 100 < density * 100);
  return lamps.map((l) => {
    const x = l.x + Math.sin(l.rot) * HEAD_REACH;
    const z = l.z + Math.cos(l.rot) * HEAD_REACH;
    return { x, y: groundHeight({ x, z }), z };
  });
}

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Pools({ points, radius, color, opacity }: { points: { x: number; y: number; z: number }[]; radius: number; color: string; opacity: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), [radius]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: poolTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [color, opacity]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    points.forEach((p, i) => {
      o.position.set(p.x, p.y + 0.035, p.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [points]);
  if (!points.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, points.length]} renderOrder={1} />;
}

const PLAZA_POINTS = [{ x: PLAZA_RING.x, y: groundHeight({ x: PLAZA_RING.x, z: PLAZA_RING.z }) + 0.06, z: PLAZA_RING.z }];

/**
 * Night lighting layer: warm light pools under every lit street lamp and at
 * building entrances (cheap additive decals), plus a small pool of real point
 * lights that hop to the lamps nearest the camera focus so people and cars
 * near the player are genuinely lit. Renders nothing by day.
 */
export function NightLights({ props, density, focus, maxLights }: { props: CityProps; density: number; focus: MutableRefObject<Vec2>; maxLights: number }) {
  const heads = useMemo(() => lampHeads(props, density), [props, density]);
  const entrances = useMemo(
    () => PLACED_BUILDINGS.filter((b) => b.entrance).map((b) => ({ x: b.entrance!.x, y: groundHeight(b.entrance!), z: b.entrance!.z })),
    [],
  );
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const last = useRef(-1);
  useFrame(({ clock }) => {
    if (!maxLights || clock.elapsedTime - last.current < 0.4) return;
    last.current = clock.elapsedTime;
    const f = focus.current;
    const nearest = heads
      .map((h, i) => ({ i, d: (h.x - f.x) ** 2 + (h.z - f.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, maxLights);
    nearest.forEach(({ i }, k) => {
      const l = lights.current[k];
      const h = heads[i]!;
      if (l) l.position.set(h.x, h.y + HEAD_Y - 0.2, h.z);
    });
  });
  return (
    <group>
      <Pools points={heads} radius={3.6} color="#ffcf8a" opacity={0.62} />
      {/* soft wash across the plaza from its central light disc */}
      <Pools points={PLAZA_POINTS} radius={12} color="#bfefff" opacity={0.3} />
      <Pools points={entrances} radius={2.6} color="#fff1c9" opacity={0.55} />
      {Array.from({ length: maxLights }, (_, k) => (
        <pointLight key={k} ref={(el) => (lights.current[k] = el)} position={[0, -50, 0]} color="#ffd9a0" intensity={38} distance={12} decay={2} />
      ))}
    </group>
  );
}
