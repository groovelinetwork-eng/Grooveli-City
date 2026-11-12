import { forwardRef, useMemo, useRef, type MutableRefObject } from 'react';
import { useActiveFrame } from './sceneActive';
import * as THREE from 'three';
import type { Group } from 'three';
import { StaticBatch } from './interior/StaticBatch';
import { sharedGeometry, sharedStandard } from './sharedGeometry';
import { ACCESSORIES, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, OUTFITS, SKIN_TONES, type AvatarConfig } from '@grooveli/frontend-domain/public';

/**
 * Stylised human avatar driven by the shared AvatarConfig. Capsule limbs on
 * hip/shoulder pivots, modelled head with face details, per-outfit garments and
 * accessories. `motion` (0..1, walking speed) drives the walk cycle; with no
 * motion the figure idles (breathing, arm sway). Used in the city, for
 * simulated presence and inside buildings.
 */
export interface AvatarProps {
  avatar: AvatarConfig;
  highlight?: boolean;
  scale?: number;
  motion?: MutableRefObject<number>;
  /** Freeze animation (reduced motion). */
  still?: boolean;
  /** Seated pose (thighs forward, hips at chair height). */
  pose?: 'stand' | 'sit';
  /** Upper-body activity layered on the pose. */
  activity?: 'idle' | 'type' | 'talk';
  /** Cast real-time shadows (off for crowds that use blob shadows). */
  castShadows?: boolean;
}

/** Hip drop for the seated pose: seat top ≈ 0.48 m. */
const SIT_DROP = -0.36;

const PANTS: Record<string, string> = {
  'Business suit': '',
  'Smart casual': '#8b7355',
  Hoodie: '#2f4a7a',
  'Creative jacket': '#1f2937',
  Scrubs: '',
  Kaftan: '',
};

export const Avatar = forwardRef<Group, AvatarProps>(function Avatar({ avatar, highlight, scale = 1, motion, still, pose = 'stand', activity = 'idle', castShadows = true }, ref) {
  const skinHex = SKIN_TONES[avatar.skin] ?? SKIN_TONES[0];
  const hairHex = HAIR_COLORS[avatar.hairColor] ?? HAIR_COLORS[0];
  const outfitHex = OUTFIT_COLORS[avatar.outfitColor] ?? OUTFIT_COLORS[0];
  const style = HAIR_STYLES[avatar.hair] ?? 'Short crop';
  const outfit = OUTFITS[avatar.outfit] ?? 'Smart casual';
  const accessory = ACCESSORIES[avatar.accessory] ?? 'None';
  const bw = [0.88, 1, 1.15][avatar.body] ?? 1;
  /** Rigid head/torso parts are merged per material; remount the batch when the look changes. */
  const look = `${avatar.body}-${avatar.skin}-${avatar.hair}-${avatar.hairColor}-${avatar.outfit}-${avatar.outfitColor}-${avatar.accessory}-${castShadows ? 1 : 0}`;

  const mat = useMemo(() => {
    const pantsHex = PANTS[outfit] || new THREE.Color(outfitHex).offsetHSL(0, 0, -0.12).getStyle();
    return {
      skin: sharedStandard(skinHex, 0.6),
      hair: sharedStandard(hairHex, 0.75),
      top: sharedStandard(outfitHex, 0.75),
      pants: sharedStandard(pantsHex, 0.8),
      shirt: sharedStandard('#f8fafc', 0.7),
      shoe: sharedStandard('#1c1917', 0.45),
      eye: sharedStandard('#111111', 0.2),
      accent: sharedStandard('#1e293b', 0.4, 0.3),
      tie: sharedStandard('#b91c1c', 0.5),
      lanyard: sharedStandard('#22d3ee', 1, 0, '#22d3ee', 0.3),
      cap: sharedStandard('#be123c', 0.6),
    };
  }, [skinHex, hairHex, outfitHex, outfit]);

  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const kneeL = useRef<Group>(null);
  const kneeR = useRef<Group>(null);
  const head = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const body = useRef<Group>(null);
  const chest = useRef<Group>(null);
  const phase = useRef(0);
  const amp = useRef(0);

  const seated = pose === 'sit';
  useActiveFrame(({ clock }, dt) => {
    const t = still ? 0 : clock.elapsedTime;
    if (!still) {
      const target = seated ? 0 : Math.min(1, motion?.current ?? 0);
      amp.current += (target - amp.current) * Math.min(1, dt * 10);
      phase.current += dt * (4 + 6 * amp.current);
    }
    const a = still ? 0 : amp.current;
    const swing = Math.sin(phase.current) * 0.62 * a;
    // legs: seated = thighs forward, shins down; standing = walk swing with a little knee bend
    if (legL.current) legL.current.rotation.x = seated ? -Math.PI / 2 + 0.05 : swing;
    if (legR.current) legR.current.rotation.x = seated ? -Math.PI / 2 - 0.05 : -swing;
    if (kneeL.current) kneeL.current.rotation.x = seated ? Math.PI / 2 : Math.max(0, swing) * 0.6;
    if (kneeR.current) kneeR.current.rotation.x = seated ? Math.PI / 2 : Math.max(0, -swing) * 0.6;
    const idle = (1 - a) * Math.sin(t * 1.6) * 0.05;
    let lx = -swing * 0.85;
    let rx = swing * 0.85;
    let lz = 0.08 + idle;
    let rz = -0.08 - idle;
    if (activity === 'type') {
      // forearms on the desk, small alternating key strokes
      lx = -1.15 + (still ? 0 : Math.sin(t * 11) * 0.05);
      rx = -1.15 + (still ? 0 : Math.sin(t * 11 + 1.7) * 0.05);
      lz = 0.22;
      rz = -0.22;
    } else if (activity === 'talk') {
      rx = -0.55 + (still ? 0 : Math.sin(t * 2.3) * 0.28);
      rz = -0.25 - (still ? 0 : Math.sin(t * 1.7) * 0.1);
      if (seated) lx = -0.7;
    } else if (seated) {
      lx = -0.75;
      rx = -0.75;
      lz = 0.15;
      rz = -0.15;
    }
    if (armL.current) {
      armL.current.rotation.x = lx;
      armL.current.rotation.z = lz;
    }
    if (armR.current) {
      armR.current.rotation.x = rx;
      armR.current.rotation.z = rz;
    }
    if (body.current) body.current.position.y = (seated ? SIT_DROP : 0) + Math.abs(Math.sin(phase.current)) * 0.035 * a;
    if (chest.current) chest.current.scale.y = 1 + Math.sin(t * 2.2) * 0.012 * (1 - a);
    if (head.current) {
      head.current.rotation.y = activity === 'talk' && !still ? Math.sin(t * 0.9) * 0.18 : 0;
      head.current.rotation.x = activity === 'type' ? 0.12 : activity === 'talk' && !still ? Math.sin(t * 2.6) * 0.05 : 0;
    }
  });

  const longTop = outfit === 'Kaftan';
  const hipY = 0.88;
  const shoulderX = 0.2 * bw;
  return (
    <group ref={ref} scale={scale}>
      {highlight ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[0.4, 0.5, 40]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} toneMapped={false} />
        </mesh>
      ) : null}
      <group ref={body}>
        {/* legs on hip pivots */}
        {([
          [[legL, kneeL], -1],
          [[legR, kneeR], 1],
        ] as const).map(([r, s]) => (
          <group key={s} ref={r[0]} position={[s * 0.095 * bw, hipY, 0]}>
            <mesh position={[0, -0.2, 0]} material={mat.pants} castShadow={castShadows} geometry={sharedGeometry('capsule', 0.072 * bw, 0.3, 4, 12)} />
            <group ref={r[1]} position={[0, -0.4, 0]}>
              <mesh position={[0, -0.2, 0]} material={mat.pants} castShadow={castShadows} geometry={sharedGeometry('capsule', 0.064 * bw, 0.34, 4, 12)} />
              <mesh position={[0, -0.45, 0.04]} rotation-x={Math.PI / 2} scale={[1.1, 1, 0.8]} material={mat.shoe} castShadow={castShadows} geometry={sharedGeometry('capsule', 0.055, 0.11, 4, 10)} />
            </group>
          </group>
        ))}
        {/* torso */}
        <group ref={chest} position={[0, 1.18, 0]}>
          <StaticBatch key={look}>
          <mesh scale={[bw, 1, 0.62]} material={mat.top} castShadow={castShadows} geometry={sharedGeometry('capsule', 0.17, 0.34, 6, 16)} />
          {longTop ? (
            <mesh position={[0, -0.36, 0]} scale={[bw, 1, 0.7]} material={mat.top} castShadow={castShadows} geometry={sharedGeometry('cylinder', 0.19, 0.24, 0.42, 18)} />
          ) : (
            <mesh position={[0, -0.28, 0]} scale={[bw, 1, 0.66]} material={mat.pants} castShadow={castShadows} geometry={sharedGeometry('cylinder', 0.165, 0.17, 0.12, 16)} />
          )}
          {outfit === 'Business suit' ? (
            <>
              <mesh position={[0, 0.1, 0.098]} rotation-x={-0.05} material={mat.shirt} geometry={sharedGeometry('cone', 0.07, 0.22, 3)} />
              <mesh position={[0, 0.06, 0.112]} material={mat.tie} geometry={sharedGeometry('box', 0.035, 0.2, 0.01)} />
            </>
          ) : null}
          {outfit === 'Smart casual' || outfit === 'Scrubs' ? (
            <mesh position={[0, 0.2, 0.06]} rotation-x={-0.4} material={outfit === 'Scrubs' ? mat.top : mat.shirt} geometry={sharedGeometry('torus', 0.075, 0.018, 6, 16, Math.PI)} />
          ) : null}
          {outfit === 'Hoodie' ? (
            <>
              <mesh position={[0, 0.24, -0.06]} rotation-x={0.5} material={mat.top} geometry={sharedGeometry('torus', 0.1, 0.04, 8, 18)} />
              <mesh position={[0, -0.1, 0.1]} material={mat.top} geometry={sharedGeometry('box', 0.2, 0.09, 0.02)} />
            </>
          ) : null}
          {outfit === 'Creative jacket' ? (
            <mesh position={[0, 0.02, 0.102]} material={mat.shirt} geometry={sharedGeometry('box', 0.1, 0.34, 0.01)} />
          ) : null}
          {outfit === 'Kaftan' ? (
            <mesh position={[0, 0.16, 0.104]} material={mat.lanyard} geometry={sharedGeometry('box', 0.05, 0.16, 0.008)} />
          ) : null}
          {accessory === 'Lanyard' ? (
            <>
              <mesh position={[0, 0.12, 0.05]} rotation-x={-0.25} material={mat.lanyard} geometry={sharedGeometry('torus', 0.09, 0.008, 6, 20, Math.PI)} />
              <mesh position={[0, 0.0, 0.11]} material={mat.shirt} geometry={sharedGeometry('box', 0.06, 0.08, 0.01)} />
            </>
          ) : null}
          </StaticBatch>
        </group>
        {/* arms on shoulder pivots */}
        {([
          [armL, -1],
          [armR, 1],
        ] as const).map(([r, s]) => (
          <group key={s} ref={r} position={[s * shoulderX, 1.4, 0]}>
            <mesh position={[s * 0.02, -0.24, 0]} material={mat.top} castShadow={castShadows} geometry={sharedGeometry('capsule', 0.052 * bw, 0.4, 4, 10)} />
            <mesh position={[s * 0.025, -0.53, 0.01]} material={mat.skin} castShadow={castShadows} geometry={sharedGeometry('sphere', 0.052, 12, 10)} />
          </group>
        ))}
        {/* neck + head */}
        <mesh position={[0, 1.5, 0]} material={mat.skin} geometry={sharedGeometry('cylinder', 0.048, 0.055, 0.1, 12)} />
        <group ref={head} position={[0, 1.66, 0.005]}>
          <StaticBatch key={look}>
          <mesh scale={[0.95, 1.06, 1]} material={mat.skin} castShadow={castShadows} geometry={sharedGeometry('sphere', 0.15, 24, 18)} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.144, -0.005, -0.005]} scale={[0.5, 1, 0.75]} material={mat.skin} geometry={sharedGeometry('sphere', 0.035, 10, 8)} />
              <mesh position={[s * 0.05, 0.01, 0.135]} material={mat.eye} geometry={sharedGeometry('sphere', 0.018, 10, 8)} />
              <mesh position={[s * 0.05, 0.048, 0.136]} rotation-z={s * -0.12} material={mat.hair} geometry={sharedGeometry('box', 0.05, 0.011, 0.01)} />
            </group>
          ))}
          <mesh position={[0, -0.025, 0.148]} material={mat.skin} geometry={sharedGeometry('sphere', 0.02, 8, 6)} />
          <mesh position={[0, -0.07, 0.132]} rotation-x={0.25} material={mat.eye} geometry={sharedGeometry('torus', 0.025, 0.005, 4, 12, Math.PI)} />
          <Hair style={style} mat={mat.hair} />
          {accessory === 'Glasses' ? (
            <group position={[0, 0.012, 0.142]}>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.05, 0, 0]} material={mat.accent} geometry={sharedGeometry('torus', 0.03, 0.005, 6, 16)} />
              ))}
              <mesh material={mat.accent} geometry={sharedGeometry('box', 0.04, 0.006, 0.006)} />
            </group>
          ) : null}
          {accessory === 'Headphones' ? (
            <>
              <mesh position={[0, 0.03, 0]} rotation-z={Math.PI / 2} rotation-y={Math.PI / 2} material={mat.accent} geometry={sharedGeometry('torus', 0.17, 0.016, 6, 24, Math.PI)} />
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.16, 0, 0]} rotation-z={Math.PI / 2} material={mat.accent} geometry={sharedGeometry('cylinder', 0.05, 0.05, 0.04, 16)} />
              ))}
            </>
          ) : null}
          {accessory === 'Cap' ? (
            <>
              <mesh position={[0, 0.06, 0]} material={mat.cap} geometry={sharedGeometry('sphere', 0.158, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)} />
              <mesh position={[0, 0.07, 0.14]} rotation-x={0.12} material={mat.cap} geometry={sharedGeometry('box', 0.2, 0.012, 0.12)} />
            </>
          ) : null}
          </StaticBatch>
        </group>
      </group>
    </group>
  );
});

function Hair({ style, mat }: { style: string; mat: THREE.Material }) {
  switch (style) {
    case 'Bald':
      return null;
    case 'Afro':
      return (
        <mesh position={[0, 0.07, -0.02]} scale={[1.1, 0.95, 1.05]} material={mat} castShadow geometry={sharedGeometry('sphere', 0.2, 20, 16)} />
      );
    case 'Buzz':
      return (
        <mesh position={[0, 0.01, -0.004]} scale={[0.97, 1.05, 1.01]} material={mat} geometry={sharedGeometry('sphere', 0.152, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.2)} />
      );
    case 'Bun':
      return (
        <>
          <Cap mat={mat} />
          <mesh position={[0, 0.17, -0.07]} material={mat} castShadow geometry={sharedGeometry('sphere', 0.065, 14, 10)} />
        </>
      );
    case 'Long':
      return (
        <>
          <Cap mat={mat} />
          <mesh position={[0, -0.12, -0.06]} scale={[1, 1, 0.55]} material={mat} castShadow geometry={sharedGeometry('capsule', 0.14, 0.2, 4, 12)} />
        </>
      );
    case 'Braids':
    case 'Locs':
      return (
        <>
          <Cap mat={mat} />
          {Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.14, -0.1, -Math.sin(a) * 0.12]} material={mat} castShadow geometry={sharedGeometry('capsule', style === 'Locs' ? 0.024 : 0.018, 0.24, 3, 6)} />
            );
          })}
        </>
      );
    default:
      return <Cap mat={mat} />;
  }
}

function Cap({ mat }: { mat: THREE.Material }) {
  return (
    <mesh position={[0, 0.025, -0.012]} scale={[1, 1.02, 1.04]} material={mat} castShadow geometry={sharedGeometry('sphere', 0.158, 22, 14, 0, Math.PI * 2, 0, Math.PI / 1.85)} />
  );
}
