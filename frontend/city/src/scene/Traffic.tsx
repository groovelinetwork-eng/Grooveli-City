import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useActiveFrame } from './sceneActive';
import * as THREE from 'three';
import { makeVehicles, pointOnLoop, type Vehicle } from '../world/ambient';
import { VEHICLE_KINDS, VEHICLE_SPECS, type VehicleKind } from '../world/vehicles';
import { buildVehicle } from './vehicles/models';
import { createVehicleAtlas } from './vehicles/atlas';
import { createVehicleMaterial, setVehicleNight } from './vehicles/material';

const tmp = new THREE.Object3D();
const color = new THREE.Color();

/** Below this many pixels per metre the simplified models (LOD 1) are used. */
export const VEHICLE_LOD_ZOOM = 12;
/** Beam geometry starts this far ahead of the vehicle origin; shifted per model length. */
const BEAM_START = 2.1;

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
 * City traffic: one instanced mesh per vehicle type (a single merged model
 * with the shared vehicle material, so one draw call per type), moving on the
 * existing road loops. Models swap to LOD 1 when zoomed out.
 */
export function Traffic({ count, reducedMotion, night }: { count: number; reducedMotion: boolean; night: boolean }) {
  const vehicles = useMemo(() => makeVehicles(count), [count]);
  const groups = useMemo(
    () =>
      VEHICLE_KINDS.map((kind) => ({ kind, list: vehicles.filter((v) => v.kind === kind) })).filter((g) => g.list.length > 0) as {
        kind: VehicleKind;
        list: Vehicle[];
      }[],
    [vehicles],
  );
  const cars = useMemo(() => vehicles.filter((v) => v.kind !== 'bus'), [vehicles]);
  const buses = useMemo(() => vehicles.filter((v) => v.kind === 'bus'), [vehicles]);

  const atlas = useMemo(() => createVehicleAtlas(), []);
  const material = useMemo(() => createVehicleMaterial(atlas), [atlas]);
  const models = useMemo(() => {
    const out = new Map<VehicleKind, [THREE.BufferGeometry, THREE.BufferGeometry]>();
    for (const g of groups) out.set(g.kind, [buildVehicle(g.kind, 0), buildVehicle(g.kind, 1)]);
    return out;
  }, [groups]);
  const beam = useMemo(
    () => ({
      geo: new THREE.PlaneGeometry(3.2, 7).rotateX(-Math.PI / 2).translate(0, 0.05, BEAM_START + 3.5),
      busGeo: new THREE.PlaneGeometry(3.6, 8).rotateX(-Math.PI / 2).translate(0, 0.05, 5.3 + 4),
      mat: new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#ffe9b0', transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    }),
    [],
  );

  useEffect(() => () => models.forEach(([a, b]) => (a.dispose(), b.dispose())), [models]);
  useEffect(
    () => () => {
      material.dispose();
      atlas.dispose();
      beam.geo.dispose();
      beam.busGeo.dispose();
      beam.mat.map?.dispose();
      beam.mat.dispose();
    },
    [material, atlas, beam],
  );
  useEffect(() => setVehicleNight(material, night), [material, night]);

  const meshes = useRef(new Map<VehicleKind, THREE.InstancedMesh>());
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const busBeamRef = useRef<THREE.InstancedMesh>(null);
  const lod = useRef<0 | 1>(0);
  const time = useRef(0);

  // body colours (re-applied after every commit so recreated meshes keep them)
  useLayoutEffect(() => {
    for (const g of groups) {
      const m = meshes.current.get(g.kind);
      if (!m) continue;
      g.list.forEach((v, i) => m.setColorAt(i, color.set(v.color)));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  const place = (t: number) => {
    let ci = 0;
    let bi = 0;
    for (const g of groups) {
      const m = meshes.current.get(g.kind);
      const ahead = VEHICLE_SPECS[g.kind].length / 2 - 2;
      g.list.forEach((v, i) => {
        const { p, heading } = pointOnLoop(v.loop, v.offset + t * v.speed);
        tmp.position.set(p.x, 0, p.z);
        tmp.rotation.set(0, heading, 0);
        tmp.updateMatrix();
        m?.setMatrixAt(i, tmp.matrix);
        if (g.kind === 'bus') busBeamRef.current?.setMatrixAt(bi++, tmp.matrix);
        else {
          tmp.translateZ(ahead);
          tmp.updateMatrix();
          beamRef.current?.setMatrixAt(ci++, tmp.matrix);
        }
      });
      if (m) m.instanceMatrix.needsUpdate = true;
    }
    if (beamRef.current) beamRef.current.instanceMatrix.needsUpdate = true;
    if (busBeamRef.current) busBeamRef.current.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => place(time.current));

  useActiveFrame((state, dt) => {
    // level of detail: all vehicles share one on-screen scale in the orthographic view
    const want: 0 | 1 = state.camera.zoom < VEHICLE_LOD_ZOOM ? 1 : 0;
    if (want !== lod.current) {
      lod.current = want;
      for (const g of groups) {
        const m = meshes.current.get(g.kind);
        const pair = models.get(g.kind);
        if (m && pair) m.geometry = pair[want];
      }
    }
    if (reducedMotion) return; // traffic paused, positions stay put
    time.current += Math.min(dt, 0.1);
    place(time.current);
  });

  const one = (k: number) => Math.max(1, k);
  return (
    <group>
      {groups.map((g) => (
        <instancedMesh
          key={g.kind}
          name={`traffic-${g.kind}`}
          ref={(m: THREE.InstancedMesh | null) => {
            if (!m) return void meshes.current.delete(g.kind);
            meshes.current.set(g.kind, m);
            m.geometry = models.get(g.kind)![lod.current];
          }}
          args={[models.get(g.kind)![0], material, g.list.length]}
          castShadow
          frustumCulled={false}
        />
      ))}
      {/* headlight beams on the road — night only, additive, no real lights */}
      <instancedMesh ref={beamRef} args={[beam.geo, beam.mat, one(cars.length)]} count={cars.length} visible={night} frustumCulled={false} />
      <instancedMesh ref={busBeamRef} args={[beam.busGeo, beam.mat, one(buses.length)]} count={buses.length} visible={night} frustumCulled={false} />
    </group>
  );
}
