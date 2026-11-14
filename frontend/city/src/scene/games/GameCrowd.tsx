import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PERSON_SCALE } from '../Ambient';
import { look } from '../../world/ambient';

/**
 * Simulated visitors at the game tables and in the lounge, in the same
 * instanced style as the city's pedestrians (a handful of draw calls for
 * everyone). Decorative only: they are not players, matches or live presence.
 */
export interface CrowdSpot {
  x: number;
  z: number;
  /** Floor height under the person. */
  y: number;
  /** Facing (Y rotation); 0 faces +Z. */
  heading: number;
  pose: 'sit' | 'stand';
}

const tmp = new THREE.Object3D();
const color = new THREE.Color();
/** Upper body drops this far (unscaled) when seated: hips at chair height. */
const SIT_DROP = 0.12;

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
}
const pair = (w: number, h: number, d: number, x: number, y: number, z: number) => mergeGeometries([box(w, h, d, -x, y, z), box(w, h, d, x, y, z)])!;

export function GameCrowd({ spots, seed = 300 }: { spots: CrowdSpot[]; seed?: number }) {
  const sit = useMemo(() => spots.filter((s) => s.pose === 'sit'), [spots]);
  const stand = useMemo(() => spots.filter((s) => s.pose === 'stand'), [spots]);
  const geo = useMemo(
    () => ({
      legsStand: pair(0.15, 0.55, 0.2, 0.1, 0.275, 0),
      shoesStand: pair(0.17, 0.13, 0.27, 0.1, 0.065, 0.03),
      // seated: thighs forward, shins down to the floor
      legsSit: mergeGeometries([pair(0.15, 0.15, 0.42, 0.1, 0.43, 0.17), pair(0.15, 0.42, 0.15, 0.1, 0.21, 0.36)])!,
      shoesSit: pair(0.17, 0.13, 0.27, 0.1, 0.065, 0.42),
      torso: mergeGeometries([box(0.44, 0.58, 0.27, 0, 0.84, 0), box(0.12, 0.5, 0.16, -0.29, 0.86, 0.04), box(0.12, 0.5, 0.16, 0.29, 0.86, 0.04)])!,
      head: new THREE.SphereGeometry(0.27, 12, 10).translate(0, 1.42, 0),
      hair: new THREE.SphereGeometry(0.285, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.46, -0.02),
    }),
    [],
  );
  const mat = useMemo(
    () => ({
      cloth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 }),
      skin: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
    }),
    [],
  );
  useLayoutEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      mat.cloth.dispose();
      mat.skin.dispose();
    },
    [geo, mat],
  );

  const r = {
    legsSit: useRef<THREE.InstancedMesh>(null),
    shoesSit: useRef<THREE.InstancedMesh>(null),
    legsStand: useRef<THREE.InstancedMesh>(null),
    shoesStand: useRef<THREE.InstancedMesh>(null),
    torso: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    hair: useRef<THREE.InstancedMesh>(null),
  };

  useLayoutEffect(() => {
    const place = (m: THREE.InstancedMesh | null, i: number, s: CrowdSpot, drop: number) => {
      if (!m) return;
      tmp.position.set(s.x, s.y - drop * PERSON_SCALE, s.z);
      tmp.rotation.set(0, s.heading, 0);
      tmp.scale.setScalar(PERSON_SCALE);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    };
    sit.forEach((s, i) => {
      place(r.legsSit.current, i, s, 0);
      place(r.shoesSit.current, i, s, 0);
    });
    stand.forEach((s, i) => {
      place(r.legsStand.current, i, s, 0);
      place(r.shoesStand.current, i, s, 0);
    });
    [...sit, ...stand].forEach((s, i) => {
      const drop = s.pose === 'sit' ? SIT_DROP : 0;
      for (const m of [r.torso.current, r.head.current, r.hair.current]) place(m, i, s, drop);
      const l = look(seed + i);
      r.torso.current?.setColorAt(i, color.set(l.color));
      r.head.current?.setColorAt(i, color.set(l.skin));
      r.hair.current?.setColorAt(i, color.set(l.hair));
      if (i < sit.length) {
        r.legsSit.current?.setColorAt(i, color.set(l.pants));
        r.shoesSit.current?.setColorAt(i, color.set(l.shoes));
      } else {
        r.legsStand.current?.setColorAt(i - sit.length, color.set(l.pants));
        r.shoesStand.current?.setColorAt(i - sit.length, color.set(l.shoes));
      }
    });
    for (const m of Object.values(r)) {
      if (!m.current) continue;
      m.current.instanceMatrix.needsUpdate = true;
      if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true;
      m.current.computeBoundingSphere();
    }
  });

  const all = sit.length + stand.length;
  const one = (n: number) => Math.max(1, n);
  return (
    <group>
      <instancedMesh ref={r.legsSit} args={[geo.legsSit, mat.cloth, one(sit.length)]} count={sit.length} castShadow />
      <instancedMesh ref={r.shoesSit} args={[geo.shoesSit, mat.cloth, one(sit.length)]} count={sit.length} />
      <instancedMesh ref={r.legsStand} args={[geo.legsStand, mat.cloth, one(stand.length)]} count={stand.length} castShadow />
      <instancedMesh ref={r.shoesStand} args={[geo.shoesStand, mat.cloth, one(stand.length)]} count={stand.length} />
      <instancedMesh ref={r.torso} args={[geo.torso, mat.cloth, one(all)]} count={all} castShadow />
      <instancedMesh ref={r.head} args={[geo.head, mat.skin, one(all)]} count={all} castShadow />
      <instancedMesh ref={r.hair} args={[geo.hair, mat.cloth, one(all)]} count={all} />
    </group>
  );
}
