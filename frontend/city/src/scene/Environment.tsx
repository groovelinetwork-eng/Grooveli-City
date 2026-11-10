import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DISTRICTS, type DistrictId } from '@grooveli/frontend-domain/public';
import type { LabelPortal } from './labels';
import { ALL_BUILDINGS, SIDEWALK_H, districtKiosk, districtLabelPoint, type CityFeatureId, type PlacedBuilding, type Vec2 } from '../world/layout';
import { buildCityProps } from '../world/props';
import { Ground } from './city/Ground';
import { Plaza } from './city/Plaza';
import { Building } from './city/Buildings';
import { Props } from './city/Props';
import { NightLights } from './city/NightLights';
import type { BoardModel } from '../services/markets';

/** District info totem (the plaza's kiosk is its glowing central disc instead). */
function Kiosk({ color, night }: { color: string; night: boolean }) {
  return (
    <group>
      <mesh position-y={1.1} castShadow>
        <boxGeometry args={[0.7, 2.2, 0.35]} />
        <meshStandardMaterial color="#0f1f3d" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.35, 0.18]}>
        <planeGeometry args={[0.55, 1.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={night ? 1.6 : 0.7} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <ringGeometry args={[1, 1.22, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Environment({
  night,
  labels,
  density,
  eventDistricts,
  reducedMotion,
  currentDistrict,
  nearbyId,
  topJobs,
  onGround,
  onBuilding,
  labelPortal,
  focus,
  nightLights,
  featurePulse,
  onFeature,
  markets,
}: {
  night: boolean;
  labels: boolean;
  density: number;
  eventDistricts: DistrictId[];
  reducedMotion: boolean;
  currentDistrict: DistrictId | null;
  nearbyId: string | null;
  topJobs: { title: string; count: number }[];
  onGround: (p: Vec2) => void;
  onBuilding: (b: PlacedBuilding) => void;
  labelPortal: LabelPortal;
  /** Camera focus (night lights follow it). */
  focus: MutableRefObject<Vec2>;
  /** Real point lights near the player at night (quality-dependent). */
  nightLights: number;
  featurePulse: number;
  onFeature: (id: CityFeatureId) => void;
  markets: BoardModel | null;
}) {
  const props = useMemo(buildCityProps, []);
  const beacon = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (beacon.current && !reducedMotion) beacon.current.children.forEach((ch) => (ch.rotation.y += dt * 0.8));
  });

  return (
    <group>
      <Ground night={night} onGround={onGround} />
      <Plaza night={night} reducedMotion={reducedMotion} onGround={onGround} />
      {ALL_BUILDINGS.map((b) => (
        <Building
          key={b.id}
          b={b}
          night={night}
          topJobs={topJobs}
          highlight={nearbyId === b.id}
          labels={labels}
          labelPortal={labelPortal}
          onSelect={onBuilding}
          onGround={onGround}
          featureNear={b.id === 'b-tech-tower' && nearbyId === 'markets-board'}
          featurePulse={b.id === 'b-tech-tower' ? featurePulse : 0}
          onFeature={onFeature}
          markets={b.id === 'b-tech-tower' ? markets : undefined}
        />
      ))}
      <Props props={props} night={night} density={density} />
      {night ? <NightLights props={props} density={density} focus={focus} maxLights={nightLights} /> : null}
      {DISTRICTS.filter((d) => d.id !== 'plaza').map((d) => {
        const k = districtKiosk(d.id);
        return (
          <group key={d.id} position={[k.x, SIDEWALK_H, k.z]}>
            <Kiosk color={d.color} night={night} />
          </group>
        );
      })}
      {/* In-world district name labels (reference: "AI ENGINEERING" pill over the street). */}
      {labels
        ? DISTRICTS.filter((d) => d.id !== currentDistrict && d.id !== 'plaza').map((d) => {
            const p = districtLabelPoint(d.id);
            const hasEvent = eventDistricts.includes(d.id);
            return (
              <Html portal={labelPortal} key={d.id} position={[p.x, 0.4, p.z]} center zIndexRange={[10, 0]} className="label label-district" aria-hidden="true">
                <span className="label-dot" style={{ background: d.color }} /> {d.name}
                {hasEvent ? <span className="label-event-dot" title="Event today"> · event</span> : null}
              </Html>
            );
          })
        : null}
      {/* event beacons */}
      <group ref={beacon}>
        {/* the plaza's own event is surfaced in the HUD so the centre stays clear (reference) */}
        {eventDistricts.filter((id) => id !== 'plaza').map((id) => {
          const k = districtKiosk(id);
          return (
            <mesh key={id} position={[k.x, 3.4, k.z]}>
              <torusGeometry args={[0.7, 0.08, 8, 32]} />
              <meshBasicMaterial color="#f472b6" toneMapped={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
