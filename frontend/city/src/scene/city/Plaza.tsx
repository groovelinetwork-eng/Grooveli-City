import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { PLAZA_H, SIDEWALK_H, type Vec2 } from '../../world/layout';
import { PLAZA_RECT, PLAZA_RING } from '../../world/plan';
import { plazaTileTexture, repeatOf } from './textures';

const CYAN = '#5ee7ff';

/** [x, z, width, depth] of planting beds under the west-strip tree rows. */
const BEDS: [number, number, number, number][] = [];
for (let z = -6.5; z <= 11.5; z += 4.4) BEDS.push([-21.2, z, 2.4, 3.2], [-17, z + 2.2, 2, 3]);

/** Grooveli Plaza: raised slate-tiled square with cyan light work (reference centre). */
export function Plaza({ night, reducedMotion, onGround }: { night: boolean; reducedMotion: boolean; onGround: (p: Vec2) => void }) {
  const P = PLAZA_RECT;
  const w = P.maxX - P.minX;
  const d = P.maxZ - P.minZ;
  const cx = (P.minX + P.maxX) / 2;
  const cz = (P.minZ + P.maxZ) / 2;
  const tiles = plazaTileTexture(night);
  const top = useMemo(() => repeatOf(tiles, w / 4, d / 4), [tiles, w, d]);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: night ? 2.6 : 1.6, toneMapped: false }), [night]);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#8ff3ff', transparent: true, opacity: 0.85, toneMapped: false }), []);
  const disc = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!disc.current || reducedMotion) return;
    (disc.current.material as THREE.MeshStandardMaterial).emissiveIntensity = (night ? 1.2 : 0.22) + Math.sin(clock.elapsedTime * 1.6) * 0.08;
  });
  const y = PLAZA_H;
  const edge = 0.14;
  const brackets: [number, number, number][] = [
    [P.minX + 1.2, P.minZ + 1.2, 0],
    [P.maxX - 1.2, P.minZ + 1.2, -Math.PI / 2],
    [P.maxX - 1.2, P.maxZ - 1.2, Math.PI],
    [P.minX + 1.2, P.maxZ - 1.2, Math.PI / 2],
  ];
  return (
    <group>
      {/* paving slab */}
      <mesh
        position={[cx, (y - SIDEWALK_H) / 2 + SIDEWALK_H, cz]}
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onGround({ x: e.point.x, z: e.point.z });
        }}
      >
        <boxGeometry args={[w, y - SIDEWALK_H, d]} />
        <meshStandardMaterial attach="material-0" color="#cfd8e6" />
        <meshStandardMaterial attach="material-1" color="#cfd8e6" />
        <meshStandardMaterial attach="material-2" map={top} roughness={0.55} metalness={0.05} />
        <meshStandardMaterial attach="material-3" color="#cfd8e6" />
        <meshStandardMaterial attach="material-4" color="#cfd8e6" />
        <meshStandardMaterial attach="material-5" color="#cfd8e6" />
      </mesh>
      {/* glowing edge strips */}
      <mesh position={[cx, y + 0.01, P.minZ + 0.25]} material={glow}>
        <boxGeometry args={[w - 0.3, 0.03, edge]} />
      </mesh>
      <mesh position={[cx, y + 0.01, P.maxZ - 0.25]} material={glow}>
        <boxGeometry args={[w - 0.3, 0.03, edge]} />
      </mesh>
      <mesh position={[P.minX + 0.25, y + 0.01, cz]} material={glow}>
        <boxGeometry args={[edge, 0.03, d - 0.3]} />
      </mesh>
      <mesh position={[P.maxX - 0.25, y + 0.01, cz]} material={glow}>
        <boxGeometry args={[edge, 0.03, d - 0.3]} />
      </mesh>
      {/* outer kerb light line on the slab's side */}
      <mesh position={[cx, SIDEWALK_H + 0.06, P.maxZ + 0.01]} material={glow}>
        <boxGeometry args={[w, 0.04, 0.02]} />
      </mesh>
      {/* corner brackets */}
      {brackets.map(([x, z, r], i) => (
        <group key={i} position={[x, y + 0.012, z]} rotation-y={r}>
          <mesh position={[0.6, 0, 0]} material={ringMat}>
            <boxGeometry args={[1.2, 0.02, 0.08]} />
          </mesh>
          <mesh position={[0, 0, 0.6]} material={ringMat}>
            <boxGeometry args={[0.08, 0.02, 1.2]} />
          </mesh>
        </group>
      ))}
      {/* the large ring and its faint companion */}
      <mesh position={[PLAZA_RING.x, y + 0.015, PLAZA_RING.z]} rotation-x={-Math.PI / 2} material={ringMat}>
        <ringGeometry args={[PLAZA_RING.radius - 0.07, PLAZA_RING.radius + 0.07, 96]} />
      </mesh>
      <mesh position={[PLAZA_RING.x, y + 0.012, PLAZA_RING.z]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[PLAZA_RING.radius - 0.6, PLAZA_RING.radius - 0.55, 96]} />
        <meshBasicMaterial color="#b9f6ff" transparent opacity={0.25} />
      </mesh>
      {/* central disc (Plaza Stage / district kiosk) */}
      <mesh ref={disc} position={[PLAZA_RING.x, y + 0.02, PLAZA_RING.z]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[PLAZA_RING.discRadius, 64]} />
        <meshStandardMaterial color="#5cbfe0" emissive="#38bdf8" emissiveIntensity={night ? 1.2 : 0.22} roughness={0.3} />
      </mesh>
      <mesh position={[PLAZA_RING.x, y + 0.025, PLAZA_RING.z]} rotation-x={-Math.PI / 2} material={ringMat}>
        <ringGeometry args={[PLAZA_RING.discRadius - 0.05, PLAZA_RING.discRadius + 0.08, 64]} />
      </mesh>
      {/* planted beds in the west strip, around the tree rows (reference left of the plaza) */}
      {BEDS.map(([x, z, bw, bd], i) => (
        <group key={i} position={[x, SIDEWALK_H, z]}>
          <mesh position-y={0.09} receiveShadow>
            <boxGeometry args={[bw, 0.18, bd]} />
            <meshStandardMaterial color={night ? '#4b5568' : '#e6e1d6'} />
          </mesh>
          <mesh position-y={0.19} rotation-x={-Math.PI / 2} receiveShadow>
            <planeGeometry args={[bw - 0.25, bd - 0.25]} />
            <meshStandardMaterial color={night ? '#1d4a24' : '#5aa845'} roughness={0.95} />
          </mesh>
        </group>
      ))}
      {/* front steps (south edge) */}
      <mesh position={[cx, SIDEWALK_H + 0.05, P.maxZ + 0.35]} receiveShadow>
        <boxGeometry args={[w * 0.5, 0.1, 0.7]} />
        <meshStandardMaterial color="#c3cede" />
      </mesh>
    </group>
  );
}
