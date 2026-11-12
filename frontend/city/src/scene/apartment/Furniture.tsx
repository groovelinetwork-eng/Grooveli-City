import { useMemo } from 'react';
import * as THREE from 'three';
import type { ApartmentMaterials } from './materials';
import { roundedBoxGeometry } from '../interior/roundedBox';

/**
 * Apartment furniture library. Every piece sits on y = 0 with its front facing
 * +Z, sized in metres. Built from rounded / lathed / capsule primitives with
 * the shared physically-based materials, so pieces read as upholstered,
 * wooden, ceramic or plastic objects rather than plain boxes.
 */
type M = { m: ApartmentMaterials };
/** Shared small-prop materials (lets interiors batch repeated pieces). */
const BUD = new THREE.MeshStandardMaterial({ color: '#e9d9b8' });
const LAPTOP_SCREEN = [0.45, 1.1].map((i) => new THREE.MeshStandardMaterial({ color: '#2a4a6a', emissive: '#8cc8ff', emissiveIntensity: i }));
type V3 = [number, number, number];

export function RB({ size, at, mat, r = 0.04, rot }: { size: V3; at: V3; mat: THREE.Material; r?: number; rot?: V3 }) {
  return (
    <mesh geometry={roundedBoxGeometry(size[0], size[1], size[2], Math.min(r, Math.min(...size) / 2 - 0.001), 3)} position={at} rotation={rot} material={mat} castShadow receiveShadow />
  );
}

export function Box({ size, at, mat, rot }: { size: V3; at: V3; mat: THREE.Material; rot?: V3 }) {
  return (
    <mesh position={at} rotation={rot} material={mat} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

export function Cyl({ r, h, at, mat, rTop, seg = 20, rot }: { r: number; h: number; at: V3; mat: THREE.Material; rTop?: number; seg?: number; rot?: V3 }) {
  return (
    <mesh position={at} rotation={rot} material={mat} castShadow receiveShadow>
      <cylinderGeometry args={[rTop ?? r, r, h, seg]} />
    </mesh>
  );
}

export function Lathe({ points, at, mat, seg = 32, scale }: { points: [number, number][]; at: V3; mat: THREE.Material; seg?: number; scale?: V3 }) {
  const geo = useMemo(() => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg), [points, seg]);
  return <mesh geometry={geo} position={at} scale={scale} material={mat} castShadow receiveShadow />;
}

// ------------------------------------------------------------------ seating

export function Sofa({ m, length, depth = 0.95, fabric, seats = 2 }: M & { length: number; depth?: number; fabric: THREE.Material; seats?: number }) {
  const arm = 0.24;
  const inner = length - arm * 2;
  const cw = inner / seats;
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.035} rTop={0.03} h={0.1} at={[sx * (length / 2 - 0.08), 0.05, sz * (depth / 2 - 0.08)]} mat={m.darkWood} seg={8} />),
      )}
      <RB size={[length, 0.3, depth]} at={[0, 0.25, 0]} mat={fabric} r={0.06} />
      {Array.from({ length: seats }, (_, i) => (
        <RB key={i} size={[cw - 0.02, 0.17, depth - 0.3]} at={[-inner / 2 + cw * (i + 0.5), 0.48, 0.1]} mat={fabric} r={0.07} />
      ))}
      <RB size={[length - 0.04, 0.5, 0.26]} at={[0, 0.62, -depth / 2 + 0.14]} mat={fabric} r={0.09} />
      {Array.from({ length: seats }, (_, i) => (
        <RB key={i} size={[cw - 0.06, 0.36, 0.16]} at={[-inner / 2 + cw * (i + 0.5), 0.72, -depth / 2 + 0.33]} mat={fabric} r={0.07} rot={[-0.18, 0, 0]} />
      ))}
      {[-1, 1].map((s) => (
        <RB key={s} size={[arm, 0.58, depth]} at={[s * (length / 2 - arm / 2), 0.4, 0]} mat={fabric} r={0.09} />
      ))}
    </group>
  );
}

export function Bed({ m, width, length }: M & { width: number; length: number }) {
  return (
    <group>
      <RB size={[width + 0.06, 0.3, length]} at={[0, 0.2, 0]} mat={m.darkWood} r={0.03} />
      <RB size={[width - 0.06, 0.24, length - 0.12]} at={[0, 0.46, 0.02]} mat={m.linen} r={0.08} />
      {/* duvet draped over the lower two-thirds */}
      <RB size={[width + 0.04, 0.14, length * 0.72]} at={[0, 0.6, length * 0.14]} mat={m.purpleFabric} r={0.06} />
      <RB size={[width + 0.08, 0.36, 0.06]} at={[0, 0.42, length / 2 + 0.01]} mat={m.purpleFabric} r={0.03} />
      <RB size={[0.06, 0.36, length * 0.72]} at={[width / 2 + 0.05, 0.42, length * 0.14]} mat={m.purpleFabric} r={0.03} />
      <RB size={[0.06, 0.36, length * 0.72]} at={[-width / 2 - 0.05, 0.42, length * 0.14]} mat={m.purpleFabric} r={0.03} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[width / 2 - 0.12, 0.15, 0.4]} at={[s * (width / 4), 0.66, -length / 2 + 0.36]} mat={m.linen} r={0.07} rot={[-0.25, 0, 0]} />
      ))}
      {/* panelled headboard */}
      <RB size={[width + 0.16, 1.05, 0.09]} at={[0, 0.62, -length / 2 - 0.02]} mat={m.darkWood} r={0.02} />
      {[-0.32, 0, 0.32].map((f) => (
        <Box key={f} size={[(width - 0.3) / 3 - 0.04, 0.6, 0.02]} at={[f * width, 0.7, -length / 2 + 0.035]} mat={m.cap} />
      ))}
    </group>
  );
}

export function DiningChair({ m }: M) {
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.045, 0.45, 0.045]} at={[sx * 0.18, 0.225, sz * 0.18]} mat={m.redPaint} />))}
      <RB size={[0.44, 0.05, 0.44]} at={[0, 0.47, 0]} mat={m.redPaint} r={0.015} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.045, 0.5, 0.045]} at={[s * 0.18, 0.74, -0.19]} mat={m.redPaint} />
      ))}
      {[0.62, 0.78, 0.94].map((y) => (
        <Box key={y} size={[0.38, 0.06, 0.03]} at={[0, y, -0.19]} mat={m.redPaint} />
      ))}
    </group>
  );
}

export function OfficeChair({ m }: M) {
  return (
    <group>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation-y={a}>
            <Box size={[0.04, 0.03, 0.3]} at={[0, 0.07, 0.15]} mat={m.metal} />
            <mesh position={[0, 0.035, 0.29]} material={m.blackPlastic} castShadow>
              <sphereGeometry args={[0.035, 10, 8]} />
            </mesh>
          </group>
        );
      })}
      <Cyl r={0.03} h={0.36} at={[0, 0.26, 0]} mat={m.metal} seg={10} />
      <RB size={[0.5, 0.09, 0.48]} at={[0, 0.48, 0]} mat={m.pinkFabric} r={0.04} />
      <Box size={[0.04, 0.32, 0.04]} at={[0, 0.66, -0.22]} mat={m.metal} />
      <RB size={[0.46, 0.5, 0.08]} at={[0, 0.88, -0.24]} mat={m.pinkFabric} r={0.04} rot={[0.12, 0, 0]} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.04, 0.03, 0.26]} at={[s * 0.27, 0.66, -0.02]} mat={m.metal} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ tables & storage

export function Desk({ m, width, depth }: M & { width: number; depth: number }) {
  return (
    <group>
      <RB size={[width, 0.045, depth]} at={[0, 0.745, 0]} mat={m.lightWood} r={0.012} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.05, 0.72, 0.05]} at={[sx * (width / 2 - 0.06), 0.36, sz * (depth / 2 - 0.06)]} mat={m.lightWood} />))}
      {/* drawer pedestal */}
      <Box size={[0.42, 0.28, depth - 0.1]} at={[width / 2 - 0.27, 0.58, 0]} mat={m.lightWood} />
      <Box size={[0.3, 0.025, 0.01]} at={[width / 2 - 0.27, 0.6, depth / 2 - 0.045]} mat={m.brass} />
      <Box size={[width - 0.12, 0.05, 0.03]} at={[0, 0.2, -depth / 2 + 0.06]} mat={m.lightWood} />
    </group>
  );
}

export function Laptop({ m, glow }: M & { glow: boolean }) {
  return (
    <group>
      <RB size={[0.38, 0.02, 0.26]} at={[0, 0.01, 0]} mat={m.metal} r={0.008} />
      <Box size={[0.32, 0.004, 0.13]} at={[0, 0.022, 0.03]} mat={m.blackPlastic} />
      <group position={[0, 0.02, -0.125]} rotation-x={-0.32}>
        <RB size={[0.38, 0.25, 0.012]} at={[0, 0.125, 0]} mat={m.metal} r={0.006} />
        <mesh position={[0, 0.125, 0.007]} material={LAPTOP_SCREEN[glow ? 1 : 0]}>
          <planeGeometry args={[0.34, 0.21]} />
        </mesh>
      </group>
    </group>
  );
}

export function SideTable({ m, size = 0.6, height = 0.66 }: M & { size?: number; height?: number }) {
  return (
    <group>
      <RB size={[size, 0.04, size]} at={[0, height - 0.02, 0]} mat={m.lightWood} r={0.01} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.04, height - 0.04, 0.04]} at={[sx * (size / 2 - 0.04), (height - 0.04) / 2, sz * (size / 2 - 0.04)]} mat={m.lightWood} />))}
      <Box size={[size - 0.08, 0.025, size - 0.08]} at={[0, 0.18, 0]} mat={m.lightWood} />
    </group>
  );
}

export function Cooler({ m }: M) {
  return (
    <group>
      <RB size={[0.75, 0.38, 0.5]} at={[0, 0.2, 0]} mat={m.bluePlastic} r={0.05} />
      <RB size={[0.78, 0.1, 0.53]} at={[0, 0.43, 0]} mat={m.whitePlastic} r={0.04} />
      <Box size={[0.3, 0.03, 0.05]} at={[0, 0.5, 0]} mat={m.whitePlastic} />
    </group>
  );
}

export function MiniFridge({ m }: M) {
  return (
    <group>
      <RB size={[0.62, 0.14, 0.56]} at={[0, 0.07, 0]} mat={m.blackPlastic} r={0.03} />
      <RB size={[0.56, 0.98, 0.5]} at={[0, 0.63, 0]} mat={m.whitePlastic} r={0.05} />
      <Box size={[0.52, 0.006, 0.01]} at={[0, 0.8, 0.252]} mat={m.blackPlastic} />
      <mesh position={[0.08, 0.98, 0.252]}>
        <planeGeometry args={[0.22, 0.05]} />
        <meshStandardMaterial color="#7cf0a0" emissive="#3fe07a" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      <Box size={[0.025, 0.3, 0.03]} at={[-0.22, 0.6, 0.26]} mat={m.metal} />
    </group>
  );
}

/** Small table with a retro radio (and the phone station on it). */
export function RadioTable({ m }: M) {
  return (
    <group>
      <SideTable m={m} size={0.5} height={0.62} />
      <group position={[0, 0.64, -0.05]}>
        <RB size={[0.42, 0.24, 0.2]} at={[0, 0.12, 0]} mat={m.lightWood} r={0.03} />
        <mesh position={[-0.06, 0.12, 0.101]}>
          <planeGeometry args={[0.22, 0.16]} />
          <meshStandardMaterial color="#6b5a46" roughness={0.9} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} size={[0.006, 0.16, 0.006]} at={[-0.16 + i * 0.04, 0.12, 0.105]} mat={m.darkMetal} />
        ))}
        {[0.11, 0.17].map((x) => (
          <Cyl key={x} r={0.022} h={0.02} at={[x, 0.12, 0.105]} mat={m.brass} rot={[Math.PI / 2, 0, 0]} seg={12} />
        ))}
        <Box size={[0.008, 0.2, 0.008]} at={[0.16, 0.33, -0.05]} mat={m.metal} rot={[0, 0, -0.4]} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ bathroom / utility

export function Toilet({ m }: M) {
  const bowl = useMemo<[number, number][]>(() => [
    [0, 0],
    [0.16, 0],
    [0.18, 0.18],
    [0.22, 0.34],
    [0.2, 0.4],
    [0, 0.4],
  ], []);
  return (
    <group>
      <Lathe points={bowl} at={[0, 0, 0.06]} mat={m.ceramic} scale={[1, 1, 1.25]} />
      <mesh position={[0, 0.41, 0.06]} rotation-x={-Math.PI / 2} scale={[1, 1.25, 1]} material={m.ceramic} castShadow>
        <torusGeometry args={[0.17, 0.03, 10, 28]} />
      </mesh>
      <RB size={[0.4, 0.4, 0.18]} at={[0, 0.62, -0.22]} mat={m.ceramic} r={0.04} />
      <RB size={[0.43, 0.04, 0.2]} at={[0, 0.84, -0.22]} mat={m.ceramic} r={0.015} />
    </group>
  );
}

export function Basin({ m }: M) {
  const pts = useMemo<[number, number][]>(() => [
    [0, 0],
    [0.2, 0],
    [0.27, 0.09],
    [0.26, 0.1],
    [0.19, 0.02],
    [0, 0.02],
  ], []);
  return <Lathe points={pts} at={[0, 0, 0]} mat={m.redPlastic} />;
}

export function Bucket({ m }: M) {
  const pts = useMemo<[number, number][]>(() => [
    [0, 0],
    [0.14, 0],
    [0.18, 0.32],
    [0.19, 0.33],
    [0.17, 0.33],
    [0.135, 0.03],
    [0, 0.03],
  ], []);
  return (
    <group>
      <Lathe points={pts} at={[0, 0, 0]} mat={m.tealPlastic} />
      <mesh position={[0, 0.33, 0]} rotation-z={Math.PI / 2} material={m.darkMetal}>
        <torusGeometry args={[0.18, 0.006, 6, 24, Math.PI]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.16, 24]} />
        <meshStandardMaterial color="#6fb4d8" roughness={0.1} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

export function Barrel({ m }: M) {
  return (
    <group>
      <Cyl r={0.3} h={0.85} at={[0, 0.425, 0]} mat={m.navyPlastic} seg={28} />
      {[0.22, 0.62].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2} material={m.navyPlastic}>
          <torusGeometry args={[0.305, 0.02, 8, 28]} />
        </mesh>
      ))}
      <Cyl r={0.29} h={0.03} at={[0, 0.86, 0]} mat={m.navyPlastic} seg={28} />
    </group>
  );
}

export function JerryCans({ m }: M) {
  return (
    <group>
      {[
        [-0.1, 0, 0],
        [0.14, 0.05, 0.6],
      ].map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={r}>
          <RB size={[0.16, 0.36, 0.26]} at={[0, 0.18, 0]} mat={m.yellowPlastic} r={0.03} />
          <Box size={[0.03, 0.06, 0.12]} at={[0, 0.39, -0.03]} mat={m.yellowPlastic} />
          <Cyl r={0.025} h={0.05} at={[0, 0.38, 0.09]} mat={m.yellowPlastic} seg={10} />
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ decor

export function Plant({ m }: M) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const a = i * 2.39996;
        const r = 0.08 + (i % 5) * 0.045;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.42 + (i % 7) * 0.07, ry: a, rx: -0.5 - (i % 3) * 0.25 };
      }),
    [],
  );
  return (
    <group>
      <Cyl r={0.15} rTop={0.19} h={0.32} at={[0, 0.16, 0]} mat={m.terracotta} />
      <Cyl r={0.17} h={0.02} at={[0, 0.32, 0]} mat={m.soil} />
      {leaves.map((l, i) => (
        <mesh key={i} position={[l.x, l.y, l.z]} rotation={[l.rx, l.ry, 0, 'YXZ']} scale={[0.09, 0.02, 0.2]} material={m.leaf} castShadow>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
      {[0, 2, 4].map((i) => (
        <mesh key={i} position={[leaves[i]!.x * 1.3, 0.86, leaves[i]!.z * 1.3]} material={BUD}>
          <sphereGeometry args={[0.035, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

export function Jar({ color = '#2f5d2c' }: { color?: string }) {
  const pts = useMemo<[number, number][]>(() => [
    [0, 0],
    [0.07, 0],
    [0.1, 0.08],
    [0.09, 0.16],
    [0.06, 0.2],
    [0.07, 0.24],
    [0, 0.24],
  ], []);
  const geo = useMemo(() => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 24), [pts]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={color} roughness={0.25} />
    </mesh>
  );
}

export function Sconce({ m, light }: M & { light: boolean }) {
  const shade = useMemo<[number, number][]>(() => [
    [0.04, 0],
    [0.09, -0.02],
    [0.1, -0.12],
    [0.07, -0.17],
    [0.02, -0.18],
  ], []);
  return (
    <group>
      <RB size={[0.1, 0.16, 0.04]} at={[0, 0, 0.02]} mat={m.brass} r={0.01} />
      <Box size={[0.025, 0.025, 0.14]} at={[0, 0.02, 0.09]} mat={m.brass} />
      <Lathe points={shade} at={[0, 0.02, 0.17]} mat={m.terracotta} />
      <mesh position={[0, -0.12, 0.17]} material={m.bulb}>
        <sphereGeometry args={[0.045, 12, 10]} />
      </mesh>
      {light ? <pointLight position={[0, -0.15, 0.28]} color="#ffc979" intensity={2.4} distance={4.5} decay={2} /> : null}
    </group>
  );
}

export function Door({ m, width, height }: M & { width: number; height: number }) {
  const pw = (width - 0.22) / 2;
  return (
    <group>
      {/* frame / architrave */}
      <Box size={[width + 0.2, 0.09, 0.05]} at={[0, height + 0.045, 0.02]} mat={m.trim} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.09, height, 0.05]} at={[s * (width / 2 + 0.055), height / 2, 0.02]} mat={m.trim} />
      ))}
      <Box size={[width, height, 0.045]} at={[0, height / 2, 0.01]} mat={m.darkWood} />
      {[0, 1].flatMap((col) =>
        [0, 1, 2].map((row) => (
          <RB key={`${col}${row}`} size={[pw - 0.04, row === 1 ? 0.62 : 0.42, 0.02]} at={[-width / 2 + 0.08 + pw * (col + 0.5) + col * 0.06, [0.38, 1.05, 1.68][row]!, 0.04]} mat={m.cap} r={0.008} />
        )),
      )}
      <mesh position={[width / 2 - 0.12, 1.02, 0.07]} material={m.brass}>
        <sphereGeometry args={[0.035, 12, 10]} />
      </mesh>
    </group>
  );
}

export function WindowFrame({ m, width, height }: M & { width: number; height: number }) {
  const bars = 6;
  return (
    <group>
      <mesh position={[0, height / 2, -0.01]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#e8f0ea" emissive="#fff4dc" emissiveIntensity={0.55} />
      </mesh>
      {/* horizontal blind slats */}
      {Array.from({ length: 9 }, (_, i) => (
        <Box key={i} size={[width - 0.08, 0.035, 0.02]} at={[0, 0.08 + (i * (height - 0.16)) / 8, 0.01]} mat={m.blind} />
      ))}
      {/* frame */}
      <Box size={[width + 0.16, 0.08, 0.08]} at={[0, height + 0.04, 0.02]} mat={m.trim} />
      <Box size={[width + 0.26, 0.06, 0.18]} at={[0, -0.03, 0.07]} mat={m.trim} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.08, height, 0.08]} at={[s * (width / 2 + 0.04), height / 2, 0.02]} mat={m.trim} />
      ))}
      {/* dark mullions (reference: vertical divisions) */}
      {Array.from({ length: bars - 1 }, (_, i) => (
        <Box key={i} size={[0.035, height, 0.05]} at={[-width / 2 + ((i + 1) * width) / bars, height / 2, 0.04]} mat={m.blackPlastic} />
      ))}
    </group>
  );
}

export function ParkingSign({ m }: M) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#173a8c';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeRect(6, 6, 116, 116);
    g.fillStyle = '#ffffff';
    g.font = '800 92px Inter, "Segoe UI", sans-serif';
    g.fillText('P', 36, 100);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      <Cyl r={0.03} h={1.4} at={[0, 0.7, 0]} mat={m.darkMetal} seg={8} />
      <mesh position={[0, 1.42, 0.03]} castShadow>
        <boxGeometry args={[0.36, 0.36, 0.03]} />
        <meshStandardMaterial attach="material-4" map={tex} />
        <meshStandardMaterial attach="material-0" color="#173a8c" />
        <meshStandardMaterial attach="material-1" color="#173a8c" />
        <meshStandardMaterial attach="material-2" color="#173a8c" />
        <meshStandardMaterial attach="material-3" color="#173a8c" />
        <meshStandardMaterial attach="material-5" color="#173a8c" />
      </mesh>
    </group>
  );
}

export function GardenBed({ m, w, d }: M & { w: number; d: number }) {
  return (
    <group>
      <Box size={[w, 0.18, 0.1]} at={[0, 0.09, d / 2]} mat={m.darkWood} />
      <Box size={[w, 0.18, 0.1]} at={[0, 0.09, -d / 2]} mat={m.darkWood} />
      <Box size={[0.1, 0.18, d]} at={[w / 2, 0.09, 0]} mat={m.darkWood} />
      <Box size={[0.1, 0.18, d]} at={[-w / 2, 0.09, 0]} mat={m.darkWood} />
      <Box size={[w - 0.1, 0.12, d - 0.1]} at={[0, 0.06, 0]} mat={m.soil} />
    </group>
  );
}

// ------------------------------------------------------------------ station objects

/** Wall-mounted profile/statistics display (Stats wall station). */
export function StatsDisplay({ m, width, height, glow }: M & { width: number; height: number; glow: boolean }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 380;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0f2140';
    g.fillRect(0, 0, 512, 380);
    g.fillStyle = '#7dd3fc';
    g.font = '700 40px Inter, "Segoe UI", sans-serif';
    g.fillText('My progress', 30, 60);
    const bars = [0.45, 0.7, 0.55, 0.85, 0.65];
    bars.forEach((v, i) => {
      g.fillStyle = i === 3 ? '#38bdf8' : '#1e5a8a';
      g.fillRect(40 + i * 90, 340 - v * 230, 60, v * 230);
    });
    g.strokeStyle = '#f472b6';
    g.lineWidth = 6;
    g.beginPath();
    bars.forEach((v, i) => (i ? g.lineTo(70 + i * 90, 320 - v * 200) : g.moveTo(70, 320 - v * 200)));
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      <RB size={[width + 0.08, height + 0.08, 0.05]} at={[0, 0, 0.025]} mat={m.blackPlastic} r={0.015} />
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={glow ? 0.9 : 0.45} />
      </mesh>
    </group>
  );
}

/** Wall shelf with trophies (Trophy shelf station). */
export function TrophyShelf({ m, width }: M & { width: number }) {
  const cup = useMemo<[number, number][]>(() => [
    [0, 0],
    [0.05, 0],
    [0.05, 0.02],
    [0.015, 0.03],
    [0.015, 0.09],
    [0.06, 0.13],
    [0.065, 0.2],
    [0.058, 0.2],
    [0.05, 0.14],
    [0, 0.12],
  ], []);
  return (
    <group>
      <RB size={[width, 0.04, 0.22]} at={[0, 0, 0.11]} mat={m.darkWood} r={0.01} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.03, 0.14, 0.03]} at={[s * (width / 2 - 0.12), -0.08, 0.04]} mat={m.brass} rot={[0.6, 0, 0]} />
      ))}
      {[-0.35, 0, 0.32].map((x, i) => (
        <Lathe key={x} points={cup} at={[x * width, 0.02, 0.11]} mat={m.brass} scale={i === 1 ? [1.3, 1.3, 1.3] : [1, 1, 1]} />
      ))}
      <RB size={[0.05, 0.2, 0.16]} at={[-0.18 * width, 0.12, 0.11]} mat={m.redPlastic} r={0.005} />
      <RB size={[0.05, 0.18, 0.16]} at={[-0.12 * width, 0.11, 0.11]} mat={m.navyPlastic} r={0.005} />
    </group>
  );
}

/** Standing document folders (CV folder station). */
export function CvFolders({ m }: M) {
  return (
    <group>
      {[
        ['#f59e0b', -0.06],
        ['#2563eb', 0],
        ['#10b981', 0.06],
      ].map(([c, x]) => (
        <mesh key={c as string} position={[x as number, 0.14, 0]} rotation-z={(x as number) * 2} castShadow>
          <boxGeometry args={[0.035, 0.28, 0.22]} />
          <meshStandardMaterial color={c as string} roughness={0.6} />
        </mesh>
      ))}
      <Box size={[0.2, 0.01, 0.27]} at={[0.18, 0.005, 0.05]} mat={m.whitePlastic} rot={[0, 0.3, 0]} />
    </group>
  );
}

/** Smartphone (Phone station). */
export function Phone({ m, glow }: M & { glow: boolean }) {
  return (
    <group rotation-x={-Math.PI / 2}>
      <RB size={[0.08, 0.16, 0.012]} at={[0, 0, 0.006]} mat={m.blackPlastic} r={0.005} />
      <mesh position={[0, 0, 0.013]}>
        <planeGeometry args={[0.07, 0.145]} />
        <meshStandardMaterial color="#3b1d5c" emissive="#c084fc" emissiveIntensity={glow ? 1.4 : 0.6} />
      </mesh>
    </group>
  );
}
