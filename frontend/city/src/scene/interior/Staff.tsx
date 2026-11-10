import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ACCESSORIES, OUTFITS, type AvatarConfig } from '@grooveli/frontend-domain/public';
import { Avatar } from '../Avatar';
import type { StaffSpec } from '../../world/interior';

const PI = Math.PI;

/** Deterministic, varied look for simulated staff. */
export function staffAvatar(i: number, outfits = ['Business suit', 'Smart casual', 'Creative jacket', 'Smart casual', 'Hoodie', 'Business suit']): AvatarConfig {
  const acc = ['None', 'Glasses', 'Lanyard', 'None', 'Lanyard', 'Glasses', 'None'];
  return {
    body: (i % 3) as 0 | 1 | 2,
    skin: (i * 4 + 1) % 6,
    hair: (i * 5 + 2) % 8,
    hairColor: (i * 3) % 6,
    outfit: Math.max(0, OUTFITS.indexOf(outfits[i % outfits.length] as (typeof OUTFITS)[number])),
    outfitColor: (i * 3 + 2) % 7,
    accessory: ACCESSORIES.indexOf(acc[i % acc.length] as (typeof ACCESSORIES)[number]),
  };
}

/** Simulated person: seated/standing pose, or a ping-pong walk along a route. */
export function StaffMember({ spec, index, reducedMotion, avatar: given }: { spec: StaffSpec; index: number; reducedMotion: boolean; avatar?: AvatarConfig }) {
  const ref = useRef<THREE.Group>(null);
  const motion = useRef(0);
  const leg = useRef({ i: 1, dir: 1, pos: { x: spec.x, z: spec.z }, wait: index * 0.7 });
  const avatar = useMemo(() => given ?? staffAvatar(index), [given, index]);
  const seatOffset = spec.pose === 'sit' ? 0.1 : 0;
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (!spec.route || reducedMotion) {
      g.position.set(spec.x - Math.sin(spec.heading) * seatOffset, 0, spec.z - Math.cos(spec.heading) * seatOffset);
      g.rotation.y = spec.heading;
      motion.current = 0;
      return;
    }
    const s = leg.current;
    if (s.wait > 0) {
      s.wait -= dt;
      motion.current = 0;
    } else {
      const target = spec.route[s.i]!;
      const dx = target.x - s.pos.x;
      const dz = target.z - s.pos.z;
      const d = Math.hypot(dx, dz);
      const v = Math.min(d, 1.15 * Math.min(dt, 0.1));
      if (d < 0.05) {
        if (s.i + s.dir < 0 || s.i + s.dir >= spec.route.length) {
          s.dir = -s.dir;
          s.wait = 2.5;
        }
        s.i += s.dir;
      } else {
        s.pos.x += (dx / d) * v;
        s.pos.z += (dz / d) * v;
        const want = Math.atan2(dx, dz);
        const diff = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y));
        g.rotation.y += diff * Math.min(1, dt * 8);
      }
      motion.current = d < 0.05 ? 0 : 0.7;
    }
    g.position.set(s.pos.x, 0, s.pos.z);
  });
  return (
    <group ref={ref}>
      <Avatar avatar={avatar} motion={motion} still={reducedMotion} pose={spec.pose} activity={spec.activity} castShadows={false} />
      <mesh position-y={0.01} rotation-x={-PI / 2}>
        <circleGeometry args={[0.26, 18]} />
        <meshBasicMaterial color="#1c140c" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}
