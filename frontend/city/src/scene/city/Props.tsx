import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityProps } from '../../world/props';
import { bannerTexture } from './textures';

export interface Inst {
  p: [number, number, number];
  r?: number;
  s?: [number, number, number];
  c?: string;
}

/** One instanced mesh from a list of transforms (+ optional per-instance colour). */
export function Instanced({ items, geometry, material, castShadow = true, receiveShadow = false }: { items: Inst[]; geometry: THREE.BufferGeometry; material: THREE.Material; castShadow?: boolean; receiveShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(0, it.r ?? 0, 0);
      o.scale.set(...(it.s ?? [1, 1, 1]));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (it.c) mesh.setColorAt(i, col.set(it.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

const CANOPY = ['#4fae3f', '#3f9a37', '#62bf48'];
const CANOPY_NIGHT = ['#1d4a24', '#183f1f', '#22552a'];

function canopyGeometry() {
  // Three overlapping blobs read as the lush rounded crowns in the reference.
  const a = new THREE.IcosahedronGeometry(1.25, 1);
  const b = new THREE.IcosahedronGeometry(0.95, 1);
  b.translate(0.75, -0.25, 0.3);
  const c = new THREE.IcosahedronGeometry(0.9, 1);
  c.translate(-0.6, -0.2, -0.45);
  const d = new THREE.IcosahedronGeometry(0.8, 1);
  d.translate(0.1, 0.55, -0.2);
  return mergeGeometries([a, b, c, d].map((g) => g.toNonIndexed()))!;
}

export function Props({ props, night, density }: { props: CityProps; night: boolean; density: number }) {
  const geo = useMemo(
    () => ({
      trunk: new THREE.CylinderGeometry(0.14, 0.2, 2, 6).translate(0, 1, 0),
      canopy: canopyGeometry().translate(0, 2.9, 0),
      planter: new THREE.CylinderGeometry(0.85, 0.9, 0.35, 16).translate(0, 0.175, 0),
      soil: new THREE.CylinderGeometry(0.75, 0.75, 0.02, 16).translate(0, 0.36, 0),
      pole: new THREE.CylinderGeometry(0.07, 0.09, 4.6, 6).translate(0, 2.3, 0),
      arm: new THREE.BoxGeometry(0.08, 0.08, 1.1).translate(0, 4.55, 0.5),
      lampHead: new THREE.BoxGeometry(0.32, 0.12, 0.55).translate(0, 4.48, 1),
      umbPole: new THREE.CylinderGeometry(0.04, 0.04, 2.1, 5).translate(0, 1.05, 0),
      umbTop: new THREE.ConeGeometry(1.35, 0.55, 10, 1, true).translate(0, 2.2, 0),
      table: new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10).translate(0, 0.75, 0),
      chairs: mergeGeometries([new THREE.BoxGeometry(0.35, 0.45, 0.35).translate(0.85, 0.22, 0), new THREE.BoxGeometry(0.35, 0.45, 0.35).translate(-0.85, 0.22, 0), new THREE.BoxGeometry(0.35, 0.45, 0.35).translate(0, 0.22, 0.85)])!,
      bench: new THREE.BoxGeometry(1.6, 0.45, 0.5).translate(0, 0.25, 0),
      hedge: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      hedgeBase: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      bollard: new THREE.CylinderGeometry(0.12, 0.14, 1.1, 8).translate(0, 0.55, 0),
      bollardCap: new THREE.CylinderGeometry(0.15, 0.15, 0.25, 8).translate(0, 1.1, 0),
      bannerPole: new THREE.CylinderGeometry(0.05, 0.05, 4.4, 5).translate(0, 2.2, 0),
      banner: new THREE.PlaneGeometry(0.9, 2.2).translate(0.5, 3, 0),
      hvac: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    }),
    [],
  );
  const mat = useMemo(
    () => ({
      trunk: new THREE.MeshStandardMaterial({ color: '#6b4a2b' }),
      canopy: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }),
      planter: new THREE.MeshStandardMaterial({ color: night ? '#5b6170' : '#e9e4da' }),
      soil: new THREE.MeshStandardMaterial({ color: '#5b4330' }),
      metal: new THREE.MeshStandardMaterial({ color: '#2f3a4b', metalness: 0.4, roughness: 0.5 }),
      lampHead: new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#ffe8a8', emissiveIntensity: night ? 2.4 : 0.35 }),
      umbTop: new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.9 }),
      table: new THREE.MeshStandardMaterial({ color: '#f5f5f4' }),
      chairs: new THREE.MeshStandardMaterial({ color: '#7c5a3a' }),
      bench: new THREE.MeshStandardMaterial({ color: '#8a6a48' }),
      hedge: new THREE.MeshStandardMaterial({ color: night ? '#1d4a24' : '#4a9e3c', roughness: 0.9, flatShading: true }),
      hedgeBase: new THREE.MeshStandardMaterial({ color: night ? '#4b5568' : '#d9d4c8' }),
      bollard: new THREE.MeshStandardMaterial({ color: '#e2e8f0' }),
      bollardCap: new THREE.MeshStandardMaterial({ color: '#e0fbff', emissive: '#67e8f9', emissiveIntensity: night ? 3 : 1.4 }),
      banner: new THREE.MeshStandardMaterial({ map: bannerTexture(), side: THREE.DoubleSide, emissive: '#1d4ed8', emissiveIntensity: night ? 0.6 : 0.1 }),
      hvac: new THREE.MeshStandardMaterial({ color: '#b8c0cc', metalness: 0.3, roughness: 0.6 }),
    }),
    [night],
  );

  const items = useMemo(() => {
    const keep = <T,>(arr: T[]) => (density >= 1 ? arr : arr.filter((_, i) => (i * 7919) % 100 < density * 100));
    const trees = keep(props.trees);
    const palette = night ? CANOPY_NIGHT : CANOPY;
    return {
      trunks: trees.map((t) => ({ p: [t.x, t.y + (t.planter ? 0.3 : 0), t.z], s: [t.s, t.s, t.s], r: t.x * 3 }) as Inst),
      canopies: trees.map((t, i) => ({ p: [t.x, t.y + (t.planter ? 0.3 : 0), t.z], s: [t.s, t.s * (0.95 + (i % 3) * 0.06), t.s], r: i * 1.7, c: palette[t.v] }) as Inst),
      planters: trees.filter((t) => t.planter).map((t) => ({ p: [t.x, t.y, t.z] }) as Inst),
      lamps: keep(props.lamps).map((l) => ({ p: [l.x, l.y, l.z], r: l.rot }) as Inst),
      umbrellas: props.umbrellas.map((u, i) => ({ p: [u.x, u.y, u.z], c: i % 3 === 2 ? '#f4c27a' : '#f7f1e3' }) as Inst),
      tables: props.tables.map((t, i) => ({ p: [t.x, t.y, t.z], r: i * 0.9 }) as Inst),
      benches: props.benches.map((b) => ({ p: [b.x, b.y, b.z], r: b.rot }) as Inst),
      hedges: props.hedges.map((h) => ({ p: [h.x, h.y + 0.35, h.z], s: [h.w - 0.2, h.h, h.d - 0.2] }) as Inst),
      hedgeBases: props.hedges.map((h) => ({ p: [h.x, h.y, h.z], s: [h.w, 0.4, h.d] }) as Inst),
      bollards: props.bollards.map((b) => ({ p: [b.x, b.y, b.z] }) as Inst),
      banners: props.banners.map((b) => ({ p: [b.x, b.y, b.z], r: b.rot }) as Inst),
      hvac: props.hvac.map((h) => ({ p: [h.x, h.y, h.z], s: [h.w, h.h, h.d] }) as Inst),
    };
  }, [props, density, night]);

  return (
    <group>
      <Instanced items={items.trunks} geometry={geo.trunk} material={mat.trunk} />
      <Instanced items={items.canopies} geometry={geo.canopy} material={mat.canopy} />
      <Instanced items={items.planters} geometry={geo.planter} material={mat.planter} receiveShadow />
      <Instanced items={items.planters} geometry={geo.soil} material={mat.soil} castShadow={false} />
      <Instanced items={items.lamps} geometry={geo.pole} material={mat.metal} />
      <Instanced items={items.lamps} geometry={geo.arm} material={mat.metal} />
      <Instanced items={items.lamps} geometry={geo.lampHead} material={mat.lampHead} castShadow={false} />
      <Instanced items={items.umbrellas} geometry={geo.umbPole} material={mat.metal} />
      <Instanced items={items.umbrellas} geometry={geo.umbTop} material={mat.umbTop} />
      <Instanced items={items.tables} geometry={geo.table} material={mat.table} />
      <Instanced items={items.tables} geometry={geo.chairs} material={mat.chairs} />
      <Instanced items={items.benches} geometry={geo.bench} material={mat.bench} />
      <Instanced items={items.hedgeBases} geometry={geo.hedgeBase} material={mat.hedgeBase} receiveShadow />
      <Instanced items={items.hedges} geometry={geo.hedge} material={mat.hedge} />
      <Instanced items={items.bollards} geometry={geo.bollard} material={mat.bollard} />
      <Instanced items={items.bollards} geometry={geo.bollardCap} material={mat.bollardCap} castShadow={false} />
      <Instanced items={items.banners} geometry={geo.bannerPole} material={mat.metal} />
      <Instanced items={items.banners} geometry={geo.banner} material={mat.banner} />
      <Instanced items={items.hvac} geometry={geo.hvac} material={mat.hvac} />
      {props.shelters.map((s, i) => (
        <Shelter key={i} x={s.x} y={s.y} z={s.z} rot={s.rot} night={night} />
      ))}
    </group>
  );
}

/** Bus / info shelter: glass back, roof slab, lit poster. */
function Shelter({ x, y, z, rot, night }: { x: number; y: number; z: number; rot: number; night: boolean }) {
  return (
    <group position={[x, y, z]} rotation-y={rot}>
      <mesh position={[0, 2.35, 0]} castShadow>
        <boxGeometry args={[3.2, 0.12, 1.5]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[0, 1.2, -0.65]}>
        <boxGeometry args={[3, 2.2, 0.06]} />
        <meshStandardMaterial color="#bfe3ff" transparent opacity={0.45} />
      </mesh>
      <mesh position={[1.45, 1.2, 0]}>
        <boxGeometry args={[0.1, 2.3, 1.3]} />
        <meshStandardMaterial color="#1e3a8a" emissive="#38bdf8" emissiveIntensity={night ? 1.2 : 0.35} />
      </mesh>
      {[-1.5, 1.5].map((dx) => (
        <mesh key={dx} position={[dx, 1.2, -0.65]}>
          <boxGeometry args={[0.08, 2.4, 0.08]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}
      <mesh position={[0, 0.45, -0.35]}>
        <boxGeometry args={[2.2, 0.1, 0.45]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
    </group>
  );
}
