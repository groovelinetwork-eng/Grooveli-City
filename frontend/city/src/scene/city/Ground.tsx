import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { DISTRICTS, PARK_BLOCK } from '@grooveli/frontend-domain/public';
import { COLS, ROWS, SIDEWALK, SIDEWALK_H, WORLD_BOUNDS, blockBounds, type AABB, type Vec2 } from '../../world/layout';
import { MINOR_STREETS } from '../../world/plan';
import { PARK_POND, buildMarkings, type Mark } from '../../world/streets';
import { asphaltTexture, paverTexture, repeatOf } from './textures';

function Marks({ marks, color, y }: { marks: Mark[]; color: string; y: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    marks.forEach((k, i) => {
      m.makeScale(k.w, 1, k.d);
      m.setPosition(k.x, y, k.z);
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [marks, y]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, marks.length]} receiveShadow>
      <boxGeometry args={[1, 0.02, 1]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </instancedMesh>
  );
}

function Slab({ b, top, night, onGround }: { b: AABB; top: THREE.Texture; night: boolean; onGround: (p: Vec2) => void }) {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const tex = useMemo(() => repeatOf(top, w / 2, d / 2), [top, w, d]);
  const curb = night ? '#4b5568' : '#dcd6ca';
  return (
    <mesh
      position={[(b.minX + b.maxX) / 2, SIDEWALK_H / 2, (b.minZ + b.maxZ) / 2]}
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onGround({ x: e.point.x, z: e.point.z });
      }}
    >
      <boxGeometry args={[w, SIDEWALK_H, d]} />
      <meshStandardMaterial attach="material-0" color={curb} />
      <meshStandardMaterial attach="material-1" color={curb} />
      <meshStandardMaterial attach="material-2" map={tex} roughness={0.95} />
      <meshStandardMaterial attach="material-3" color={curb} />
      <meshStandardMaterial attach="material-4" color={curb} />
      <meshStandardMaterial attach="material-5" color={curb} />
    </mesh>
  );
}

export function Ground({ night, onGround }: { night: boolean; onGround: (p: Vec2) => void }) {
  const asphalt = asphaltTexture(night);
  const pavers = paverTexture(night);
  const width = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
  const depth = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
  const roadTex = useMemo(() => repeatOf(asphalt, (width + 200) / 6, (depth + 200) / 6), [asphalt, width, depth]);
  const marks = useMemo(buildMarkings, []);
  const blocks = useMemo(() => {
    const out: AABB[] = [];
    for (let i = 0; i < COLS.length; i++) for (let j = 0; j < ROWS.length; j++) out.push(blockBounds({ x: i, z: j }));
    return out;
  }, []);
  const park = blockBounds(PARK_BLOCK);
  const lot = night ? '#2f3747' : '#c7c2b6';
  const cx = (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2;
  const cz = (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) / 2;
  return (
    <group>
      {/* asphalt (extends past the world edge so the frame never shows void) */}
      <mesh
        position={[cx, 0, cz]}
        rotation-x={-Math.PI / 2}
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onGround({ x: e.point.x, z: e.point.z });
        }}
      >
        <planeGeometry args={[width + 200, depth + 200]} />
        <meshStandardMaterial map={roadTex} roughness={0.92} />
      </mesh>
      {/* outer greenbelt beyond the ring road */}
      <mesh position={[cx, 0.05, cz]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[Math.hypot(width, depth) / 2 + 2, Math.hypot(width, depth) / 2 + 120, 64]} />
        <meshStandardMaterial color={night ? '#14301f' : '#7bb661'} />
      </mesh>
      {blocks.map((b, i) => (
        <Slab key={i} b={b} top={pavers} night={night} onGround={onGround} />
      ))}
      {/* inner lots (inside the sidewalk ring) — the plaza block is fully landscaped, see Plaza */}
      {DISTRICTS.filter((d) => d.id !== 'plaza').map((d) => {
        const b = blockBounds(d.grid);
        return (
          <mesh key={d.id} position={[(b.minX + b.maxX) / 2, SIDEWALK_H + 0.005, (b.minZ + b.maxZ) / 2]} rotation-x={-Math.PI / 2} receiveShadow>
            <planeGeometry args={[b.maxX - b.minX - SIDEWALK * 2, b.maxZ - b.minZ - SIDEWALK * 2]} />
            <meshStandardMaterial color={lot} roughness={0.95} />
          </mesh>
        );
      })}
      {/* park lawn */}
      <mesh position={[(park.minX + park.maxX) / 2, SIDEWALK_H + 0.01, (park.minZ + park.maxZ) / 2]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[park.maxX - park.minX - SIDEWALK * 2, park.maxZ - park.minZ - SIDEWALK * 2]} />
        <meshStandardMaterial color={night ? '#1a4027' : '#6dbb4f'} />
      </mesh>
      <mesh position={[(park.minX + park.maxX) / 2 + PARK_POND.dx, SIDEWALK_H + 0.02, (park.minZ + park.maxZ) / 2 + PARK_POND.dz]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[PARK_POND.r, 40]} />
        <meshStandardMaterial color={night ? '#0c2a4a' : '#5cc3e8'} roughness={0.2} metalness={0.1} />
      </mesh>
      {/* minor street surface over the block slab */}
      {MINOR_STREETS.map((m, i) => (
        <mesh key={i} position={[(m.minX + m.maxX) / 2, SIDEWALK_H + 0.012, (m.minZ + m.maxZ) / 2]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[m.maxX - m.minX, m.maxZ - m.minZ]} />
          <meshStandardMaterial map={roadTex} roughness={0.92} />
        </mesh>
      ))}
      <Marks marks={marks.dashes} color={night ? '#94a3b8' : '#f1f5f9'} y={0.02} />
      <Marks marks={marks.lines} color={night ? '#94a3b8' : '#f8fafc'} y={0.02} />
      <Marks marks={marks.zebra.filter((z) => !MINOR_STREETS.some((m) => z.x > m.minX && z.x < m.maxX && z.z > m.minZ))} color={night ? '#cbd5e1' : '#f8fafc'} y={0.025} />
      <Marks marks={marks.zebra.filter((z) => MINOR_STREETS.some((m) => z.x > m.minX && z.x < m.maxX && z.z > m.minZ))} color={night ? '#cbd5e1' : '#f8fafc'} y={SIDEWALK_H + 0.025} />
    </group>
  );
}
