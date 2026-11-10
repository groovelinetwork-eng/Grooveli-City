import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makePedestrians, makeVehicles, pointOnLoop, type Vehicle } from '../world/ambient';
import { groundHeight } from '../world/layout';

const tmp = new THREE.Object3D();
const color = new THREE.Color();
/** Chibi scale matching the reference's oversized figures (~40 px tall at zoom 20). */
export const PERSON_SCALE = 1.45;

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
}
const pair = (w: number, h: number, d: number, x: number, y: number, z: number) => mergeGeometries([box(w, h, d, -x, y, z), box(w, h, d, x, y, z)])!;

/** Soft headlight beam on the road: bright near the car, fading and widening ahead. */
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(22, 128);
  g.lineTo(42, 128);
  g.lineTo(64, 0);
  g.lineTo(0, 0);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Ambient city life: instanced pedestrians and vehicles on fixed loops.
 * Meshes and materials are created once; day/night only changes material
 * intensities, so per-instance colours are never lost when the time of day
 * changes (that recreation previously turned everyone grey-white at night).
 */
export function Ambient({ pedestrians, vehicles, reducedMotion, night }: { pedestrians: number; vehicles: number; reducedMotion: boolean; night: boolean }) {
  const walkers = useMemo(() => makePedestrians(pedestrians), [pedestrians]);
  const bagIdx = useMemo(() => walkers.map((w, i) => (w.bag ? i : -1)).filter((i) => i >= 0), [walkers]);
  const all = useMemo(() => makeVehicles(vehicles), [vehicles]);
  const cars = useMemo(() => all.filter((v) => v.kind === 'car' || v.kind === 'taxi' || v.kind === 'exec'), [all]);
  const vans = useMemo(() => all.filter((v) => v.kind === 'van'), [all]);
  const buses = useMemo(() => all.filter((v) => v.kind === 'bus'), [all]);
  const taxis = useMemo(() => cars.map((c, i) => (c.kind === 'taxi' ? i : -1)).filter((i) => i >= 0), [cars]);

  const geo = useMemo(
    () => ({
      legs: mergeGeometries([box(0.15, 0.55, 0.2, -0.1, 0.275, 0), box(0.15, 0.55, 0.2, 0.1, 0.275, 0)])!,
      shoes: pair(0.17, 0.13, 0.27, 0.1, 0.065, 0.03),
      torso: mergeGeometries([box(0.44, 0.58, 0.27, 0, 0.84, 0), box(0.12, 0.5, 0.16, -0.29, 0.86, 0), box(0.12, 0.5, 0.16, 0.29, 0.86, 0)])!,
      bag: box(0.32, 0.38, 0.14, 0, 0.88, -0.2),
      head: new THREE.SphereGeometry(0.27, 12, 10).translate(0, 1.42, 0),
      hair: new THREE.SphereGeometry(0.285, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.46, -0.02),
      shadow: new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2).translate(0, 0.015, 0),
      carBody: mergeGeometries([box(1.8, 0.62, 4, 0, 0.62, 0), box(1.5, 0.08, 1.9, 0, 1.39, -0.15)])!,
      carGlass: box(1.62, 0.5, 2.1, 0, 1.1, -0.15),
      carHead: pair(0.36, 0.14, 0.06, 0.6, 0.72, 2.01),
      carTail: pair(0.36, 0.12, 0.06, 0.62, 0.78, -2.01),
      wheels: mergeGeometries(
        [
          [-0.85, 1.25],
          [0.85, 1.25],
          [-0.85, -1.25],
          [0.85, -1.25],
        ].map(([x, z]) => new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10).rotateZ(Math.PI / 2).translate(x!, 0.34, z!).toNonIndexed()),
      )!,
      taxiSign: box(0.7, 0.22, 0.32, 0, 1.53, -0.15),
      vanBody: mergeGeometries([box(1.95, 1.75, 4.7, 0, 1.2, -0.1), box(1.9, 0.9, 0.9, 0, 0.78, 2.45)])!,
      vanGlass: mergeGeometries([box(1.7, 0.55, 0.05, 0, 1.55, 2.13), box(1.98, 0.42, 1.0, 0, 1.6, 1.55)])!,
      vanHead: pair(0.34, 0.14, 0.06, 0.65, 0.85, 2.92),
      vanTail: pair(0.2, 0.36, 0.06, 0.85, 1.2, -2.47),
      vanWheels: mergeGeometries(
        [
          [-0.9, 1.7],
          [0.9, 1.7],
          [-0.9, -1.6],
          [0.9, -1.6],
        ].map(([x, z]) => new THREE.CylinderGeometry(0.38, 0.38, 0.26, 10).rotateZ(Math.PI / 2).translate(x!, 0.38, z!).toNonIndexed()),
      )!,
      busBody: mergeGeometries([box(2.5, 2.4, 10.5, 0, 1.6, 0), box(2.3, 0.12, 10, 0, 2.86, 0)])!,
      busGlass: mergeGeometries([box(2.56, 0.85, 9.6, 0, 2.0, -0.2), box(2.2, 1.1, 0.06, 0, 1.9, 5.27)])!,
      busHead: pair(0.4, 0.16, 0.06, 0.9, 0.85, 5.27),
      busTail: pair(0.3, 0.4, 0.06, 1.0, 1.0, -5.27),
      busWheels: mergeGeometries(
        [
          [-1.15, 3.6],
          [1.15, 3.6],
          [-1.15, -3.4],
          [1.15, -3.4],
        ].map(([x, z]) => new THREE.CylinderGeometry(0.48, 0.48, 0.3, 10).rotateZ(Math.PI / 2).translate(x!, 0.48, z!).toNonIndexed()),
      )!,
      beam: new THREE.PlaneGeometry(3.2, 7).rotateX(-Math.PI / 2).translate(0, 0.05, 2.1 + 3.5),
      busBeam: new THREE.PlaneGeometry(3.6, 8).rotateX(-Math.PI / 2).translate(0, 0.05, 5.3 + 4),
    }),
    [],
  );
  // Created once (stable identities keep the instanced meshes alive); night tweaks happen in the effect below.
  const mat = useMemo(
    () => ({
      cloth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 }),
      skin: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }),
      paint: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.3 }),
      glass: new THREE.MeshStandardMaterial({ color: '#1d2b44', roughness: 0.15, metalness: 0.6 }),
      tyre: new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 }),
      taxiSign: new THREE.MeshStandardMaterial({ color: '#fef9c3', emissive: '#fde047', emissiveIntensity: 0.3 }),
      head: new THREE.MeshStandardMaterial({ color: '#fffbeb', emissive: '#fff4cc', emissiveIntensity: 0.4, toneMapped: false }),
      tail: new THREE.MeshStandardMaterial({ color: '#7f1d1d', emissive: '#ef4444', emissiveIntensity: 0.35, toneMapped: false }),
      beam: new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#ffe9b0', transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    }),
    [],
  );
  useEffect(() => {
    mat.glass.color.set(night ? '#7fa6e0' : '#1d2b44');
    mat.glass.emissive.set(night ? '#3b5f9e' : '#000000');
    mat.glass.emissiveIntensity = night ? 0.45 : 0;
    mat.taxiSign.emissiveIntensity = night ? 1.6 : 0.3;
    mat.head.emissiveIntensity = night ? 2.4 : 0.4;
    mat.tail.emissiveIntensity = night ? 2.0 : 0.35;
  }, [night, mat]);

  const r = {
    legs: useRef<THREE.InstancedMesh>(null),
    shoes: useRef<THREE.InstancedMesh>(null),
    torso: useRef<THREE.InstancedMesh>(null),
    bag: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    hair: useRef<THREE.InstancedMesh>(null),
    pShadow: useRef<THREE.InstancedMesh>(null),
    carBody: useRef<THREE.InstancedMesh>(null),
    carGlass: useRef<THREE.InstancedMesh>(null),
    carWheels: useRef<THREE.InstancedMesh>(null),
    carHead: useRef<THREE.InstancedMesh>(null),
    carTail: useRef<THREE.InstancedMesh>(null),
    taxiSign: useRef<THREE.InstancedMesh>(null),
    vanBody: useRef<THREE.InstancedMesh>(null),
    vanGlass: useRef<THREE.InstancedMesh>(null),
    vanWheels: useRef<THREE.InstancedMesh>(null),
    vanHead: useRef<THREE.InstancedMesh>(null),
    vanTail: useRef<THREE.InstancedMesh>(null),
    busBody: useRef<THREE.InstancedMesh>(null),
    busGlass: useRef<THREE.InstancedMesh>(null),
    busWheels: useRef<THREE.InstancedMesh>(null),
    busHead: useRef<THREE.InstancedMesh>(null),
    busTail: useRef<THREE.InstancedMesh>(null),
    beam: useRef<THREE.InstancedMesh>(null),
    busBeam: useRef<THREE.InstancedMesh>(null),
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
    cars.forEach((c, i) => r.carBody.current?.setColorAt(i, color.set(c.color)));
    vans.forEach((c, i) => r.vanBody.current?.setColorAt(i, color.set(c.color)));
    buses.forEach((c, i) => r.busBody.current?.setColorAt(i, color.set(c.color)));
    for (const m of [r.legs, r.torso, r.head, r.hair, r.shoes, r.bag, r.carBody, r.vanBody, r.busBody]) if (m.current?.instanceColor) m.current.instanceColor.needsUpdate = true;
  });

  const placeVehicles = (list: Vehicle[], meshes: RefObject<THREE.InstancedMesh | null>[], t: number, taxiMesh?: RefObject<THREE.InstancedMesh | null>) => {
    let ti = 0;
    list.forEach((c, i) => {
      const { p, heading } = pointOnLoop(c.loop, c.offset + t * c.speed);
      tmp.position.set(p.x, 0, p.z);
      tmp.rotation.set(0, heading, 0);
      tmp.updateMatrix();
      for (const m of meshes) m.current?.setMatrixAt(i, tmp.matrix);
      if (taxiMesh && c.kind === 'taxi') taxiMesh.current?.setMatrixAt(ti++, tmp.matrix);
    });
  };

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
    placeVehicles(cars, [r.carBody, r.carGlass, r.carWheels, r.carHead, r.carTail], t, r.taxiSign);
    placeVehicles(vans, [r.vanBody, r.vanGlass, r.vanWheels, r.vanHead, r.vanTail], t);
    placeVehicles(buses, [r.busBody, r.busGlass, r.busWheels, r.busHead, r.busTail, r.busBeam], t);
    // one beam mesh covers cars and vans (cars first, then vans)
    [...cars, ...vans].forEach((c, i) => {
      const { p, heading } = pointOnLoop(c.loop, c.offset + t * c.speed);
      tmp.position.set(p.x, 0, p.z);
      tmp.rotation.set(0, heading, 0);
      tmp.updateMatrix();
      r.beam.current?.setMatrixAt(i, tmp.matrix);
    });
    for (const m of Object.values(r)) if (m.current) m.current.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => place(time.current));

  useFrame((_, dt) => {
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

      <instancedMesh ref={r.carBody} args={[geo.carBody, mat.paint, one(cars.length)]} count={cars.length} castShadow frustumCulled={false} />
      <instancedMesh ref={r.carGlass} args={[geo.carGlass, mat.glass, one(cars.length)]} count={cars.length} frustumCulled={false} />
      <instancedMesh ref={r.carWheels} args={[geo.wheels, mat.tyre, one(cars.length)]} count={cars.length} frustumCulled={false} />
      <instancedMesh ref={r.carHead} args={[geo.carHead, mat.head, one(cars.length)]} count={cars.length} frustumCulled={false} />
      <instancedMesh ref={r.carTail} args={[geo.carTail, mat.tail, one(cars.length)]} count={cars.length} frustumCulled={false} />
      <instancedMesh ref={r.taxiSign} args={[geo.taxiSign, mat.taxiSign, one(taxis.length)]} count={taxis.length} frustumCulled={false} />

      <instancedMesh ref={r.vanBody} args={[geo.vanBody, mat.paint, one(vans.length)]} count={vans.length} castShadow frustumCulled={false} />
      <instancedMesh ref={r.vanGlass} args={[geo.vanGlass, mat.glass, one(vans.length)]} count={vans.length} frustumCulled={false} />
      <instancedMesh ref={r.vanWheels} args={[geo.vanWheels, mat.tyre, one(vans.length)]} count={vans.length} frustumCulled={false} />
      <instancedMesh ref={r.vanHead} args={[geo.vanHead, mat.head, one(vans.length)]} count={vans.length} frustumCulled={false} />
      <instancedMesh ref={r.vanTail} args={[geo.vanTail, mat.tail, one(vans.length)]} count={vans.length} frustumCulled={false} />

      <instancedMesh ref={r.busBody} args={[geo.busBody, mat.paint, one(buses.length)]} count={buses.length} castShadow frustumCulled={false} />
      <instancedMesh ref={r.busGlass} args={[geo.busGlass, mat.glass, one(buses.length)]} count={buses.length} frustumCulled={false} />
      <instancedMesh ref={r.busWheels} args={[geo.busWheels, mat.tyre, one(buses.length)]} count={buses.length} frustumCulled={false} />
      <instancedMesh ref={r.busHead} args={[geo.busHead, mat.head, one(buses.length)]} count={buses.length} frustumCulled={false} />
      <instancedMesh ref={r.busTail} args={[geo.busTail, mat.tail, one(buses.length)]} count={buses.length} frustumCulled={false} />

      {/* headlight beams on the road — night only, additive, no real lights */}
      <instancedMesh ref={r.beam} args={[geo.beam, mat.beam, one(cars.length + vans.length)]} count={cars.length + vans.length} visible={night} frustumCulled={false} />
      <instancedMesh ref={r.busBeam} args={[geo.busBeam, mat.beam, one(buses.length)]} count={buses.length} visible={night} frustumCulled={false} />
    </group>
  );
}
