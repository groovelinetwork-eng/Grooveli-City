import { useLayoutEffect, useMemo, useRef } from 'react';
import { useActiveFrame } from './sceneActive';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makePedestrians, pointOnLoop } from '../world/ambient';
import { Traffic } from './Traffic';
import { groundHeight } from '../world/layout';

const tmp = new THREE.Object3D();
const color = new THREE.Color();
/** Chibi scale matching the reference's oversized figures (~40 px tall at zoom 20). */
export const PERSON_SCALE = 1.45;

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
}
const pair = (w: number, h: number, d: number, x: number, y: number, z: number) => mergeGeometries([box(w, h, d, -x, y, z), box(w, h, d, x, y, z)])!;

/**
 * Ambient city life: instanced pedestrians on fixed loops (traffic: Traffic.tsx).
 * Meshes and materials are created once; day/night only changes material
 * intensities, so per-instance colours are never lost when the time of day
 * changes (that recreation previously turned everyone grey-white at night).
 */
export function Ambient({ pedestrians, vehicles, reducedMotion, night }: { pedestrians: number; vehicles: number; reducedMotion: boolean; night: boolean }) {
  const walkers = useMemo(() => makePedestrians(pedestrians), [pedestrians]);
  const bagIdx = useMemo(() => walkers.map((w, i) => (w.bag ? i : -1)).filter((i) => i >= 0), [walkers]);
  const geo = useMemo(
    () => ({
      legs: mergeGeometries([box(0.15, 0.55, 0.2, -0.1, 0.275, 0), box(0.15, 0.55, 0.2, 0.1, 0.275, 0)])!,
      shoes: pair(0.17, 0.13, 0.27, 0.1, 0.065, 0.03),
      torso: mergeGeometries([box(0.44, 0.58, 0.27, 0, 0.84, 0), box(0.12, 0.5, 0.16, -0.29, 0.86, 0), box(0.12, 0.5, 0.16, 0.29, 0.86, 0)])!,
      bag: box(0.32, 0.38, 0.14, 0, 0.88, -0.2),
      head: new THREE.SphereGeometry(0.27, 12, 10).translate(0, 1.42, 0),
      hair: new THREE.SphereGeometry(0.285, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.46, -0.02),
      shadow: new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2).translate(0, 0.015, 0),
    }),
    [],
  );
  // Created once (stable identities keep the instanced meshes alive).
  const mat = useMemo(
    () => ({
      cloth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 }),
      skin: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }),
    }),
    [],
  );
  const r = {
    legs: useRef<THREE.InstancedMesh>(null),
    shoes: useRef<THREE.InstancedMesh>(null),
    torso: useRef<THREE.InstancedMesh>(null),
    bag: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    hair: useRef<THREE.InstancedMesh>(null),
    pShadow: useRef<THREE.InstancedMesh>(null),
  };
  const time = useRef(0);

  // Per-instance colours. Runs after every commit (cheap: a few hundred writes) so
  // any mesh R3F had to recreate gets its colours back immediately.
  useLayoutEffect(() => {
    walkers.forEach((w, i) => {
      r.legs.current?.setColorAt(i, color.set(w.pants));
      r.torso.current?.setColorAt(i, color.set(w.color));
      r.head.current?.setColorAt(i, color.set(w.skin));
      r.hair.current?.setColorAt(i, color.set(w.hair));
      r.shoes.current?.setColorAt(i, color.set(w.shoes ?? '#111827'));
    });
    bagIdx.forEach((wi, k) => r.bag.current?.setColorAt(k, color.set(walkers[wi]!.bag!)));
    for (const m of [r.legs, r.torso, r.head, r.hair, r.shoes, r.bag]) if (m.current?.instanceColor) m.current.instanceColor.needsUpdate = true;
  });

  const place = (t: number) => {
    let bi = 0;
    walkers.forEach((w, i) => {
      const { p, heading } = pointOnLoop(w.loop, w.offset + t * w.speed);
      const moving = w.speed > 0;
      const bob = reducedMotion || !moving ? 0 : Math.abs(Math.sin((t + i) * 7)) * 0.06;
      const y = groundHeight(p) + bob;
      // Idle people slowly turn to face each other / around.
      tmp.rotation.set(0, moving ? heading : w.offset + Math.sin(t * 0.2 + i) * 0.6, 0);
      tmp.position.set(p.x, y, p.z);
      tmp.scale.setScalar(PERSON_SCALE);
      tmp.updateMatrix();
      for (const m of [r.legs, r.torso, r.head, r.hair, r.shoes]) m.current?.setMatrixAt(i, tmp.matrix);
      if (w.bag) r.bag.current?.setMatrixAt(bi++, tmp.matrix);
      tmp.position.y = groundHeight(p);
      tmp.updateMatrix();
      r.pShadow.current?.setMatrixAt(i, tmp.matrix);
    });
    tmp.scale.setScalar(1);
    for (const m of Object.values(r)) if (m.current) m.current.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => place(time.current));

  useActiveFrame((_, dt) => {
    if (reducedMotion) return; // ambient motion paused, positions stay put
    time.current += Math.min(dt, 0.1);
    place(time.current);
  });

  const n = walkers.length;
  const one = (k: number) => Math.max(1, k);
  return (
    <group>
      <instancedMesh ref={r.pShadow} args={[geo.shadow, mat.shadow, n]} frustumCulled={false} />
      <instancedMesh ref={r.legs} args={[geo.legs, mat.cloth, n]} castShadow frustumCulled={false} />
      <instancedMesh ref={r.shoes} args={[geo.shoes, mat.cloth, n]} frustumCulled={false} />
      <instancedMesh ref={r.torso} args={[geo.torso, mat.cloth, n]} castShadow frustumCulled={false} />
      <instancedMesh ref={r.bag} args={[geo.bag, mat.cloth, one(bagIdx.length)]} count={bagIdx.length} frustumCulled={false} />
      <instancedMesh ref={r.head} args={[geo.head, mat.skin, n]} castShadow frustumCulled={false} />
      <instancedMesh ref={r.hair} args={[geo.hair, mat.cloth, n]} frustumCulled={false} />

      <Traffic count={vehicles} reducedMotion={reducedMotion} night={night} />
    </group>
  );
}
