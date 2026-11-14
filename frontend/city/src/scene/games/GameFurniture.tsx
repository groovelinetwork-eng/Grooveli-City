import { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cyl } from '../apartment/Furniture';
import { roundedBoxGeometry } from '../interior/roundedBox';
import { CafeChair } from '../hq/OfficeFurniture';
import { sharedGeometry } from '../sharedGeometry';
import type { GamesMaterials } from './gamesAssets';

/**
 * Games Zone furniture, modelled life-size (front = +Z, floor = y 0) and
 * placed at FURNITURE_SCALE to suit the city's people. Repeated shapes
 * (chess pieces, tokens, balls) share cached geometry.
 */
type V3 = [number, number, number];
type G = { G: GamesMaterials };
const PI = Math.PI;

/**
 * Lean rounded box for the open-air Games Zone: the same shape as the
 * interiors' RB but with fewer rounding segments (~140 instead of ~570
 * triangles) — the difference is invisible at city viewing distance.
 */
export function RBox({ size, at, mat, r = 0.03, rot, shadow = true }: { size: V3; at: V3; mat: THREE.Material; r?: number; rot?: V3; shadow?: boolean }) {
  const geo = roundedBoxGeometry(size[0], size[1], size[2], Math.min(r, Math.min(...size) / 2 - 0.001), 2, 1);
  return <mesh geometry={geo} position={at} rotation={rot} material={mat} castShadow={shadow} receiveShadow />;
}

/** Light potted shrub (pot + leaf clusters) for the open-air zone. */
export function Shrub({ G, s = 1 }: G & { s?: number }) {
  return (
    <group scale={s}>
      <Cyl r={0.22} rTop={0.27} h={0.5} at={[0, 0.25, 0]} mat={G.m.charcoal} seg={16} />
      <Cyl r={0.25} h={0.02} at={[0, 0.5, 0]} mat={G.m.soil} seg={16} />
      {[
        [0, 0.95, 0, 0.34],
        [0.16, 0.78, 0.08, 0.24],
        [-0.15, 0.82, -0.06, 0.25],
        [0.02, 1.22, -0.03, 0.22],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x!, y!, z!]} material={G.m.leaf} castShadow>
          <icosahedronGeometry args={[r!, 1]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ shared lathe shapes

const PROFILES = {
  pawn: [[0, 0], [0.021, 0], [0.021, 0.006], [0.013, 0.012], [0.008, 0.03], [0.012, 0.034], [0.006, 0.038], [0.011, 0.044], [0.011, 0.052], [0.006, 0.057], [0, 0.058]],
  rook: [[0, 0], [0.023, 0], [0.023, 0.007], [0.015, 0.012], [0.012, 0.05], [0.017, 0.054], [0.017, 0.066], [0, 0.066]],
  bishop: [[0, 0], [0.022, 0], [0.022, 0.007], [0.014, 0.013], [0.008, 0.05], [0.013, 0.055], [0.012, 0.07], [0.005, 0.078], [0.003, 0.083], [0, 0.084]],
  queen: [[0, 0], [0.024, 0], [0.024, 0.007], [0.016, 0.013], [0.009, 0.06], [0.016, 0.066], [0.012, 0.074], [0.016, 0.084], [0.006, 0.09], [0, 0.092]],
  king: [[0, 0], [0.025, 0], [0.025, 0.007], [0.017, 0.013], [0.01, 0.062], [0.017, 0.068], [0.012, 0.076], [0.014, 0.088], [0.004, 0.092], [0.004, 0.104], [0, 0.104]],
  /** Ludo pawn (cone + ball head), unit height 1. */
  token: [[0, 0], [0.34, 0], [0.34, 0.06], [0.24, 0.12], [0.14, 0.52], [0.2, 0.58], [0.16, 0.64], [0.2, 0.7], [0.23, 0.8], [0.2, 0.9], [0.11, 0.97], [0, 1]],
  /** Statue plinth drum. */
  plinth: [[0, 0], [0.5, 0], [0.5, 0.08], [0.42, 0.14], [0.38, 0.62], [0.46, 0.68], [0.46, 0.76], [0, 0.76]],
} satisfies Record<string, number[][]>;

const lathes = new Map<string, THREE.LatheGeometry>();
function lathe(name: keyof typeof PROFILES, seg = 12) {
  const key = `${name}|${seg}`;
  let g = lathes.get(key);
  if (!g) {
    g = new THREE.LatheGeometry((PROFILES[name] as number[][]).map(([x, y]) => new THREE.Vector2(x, y)), seg);
    lathes.set(key, g);
  }
  return g;
}

// ------------------------------------------------------------------ boards & tables

type PieceKind = 'pawn' | 'rook' | 'bishop' | 'queen' | 'king';
/** A believable mid-game: [file 0-7, rank 0-7, kind, white?] */
const CHESS_POSITION: [number, number, PieceKind, boolean][] = [
  [0, 0, 'rook', true], [4, 0, 'king', true], [3, 1, 'queen', true], [5, 1, 'pawn', true], [6, 1, 'pawn', true], [7, 1, 'pawn', true], [2, 2, 'bishop', true], [3, 3, 'pawn', true], [4, 3, 'pawn', true],
  [0, 7, 'rook', false], [6, 7, 'king', false], [3, 7, 'queen', false], [5, 6, 'pawn', false], [6, 6, 'pawn', false], [7, 6, 'pawn', false], [5, 5, 'bishop', false], [2, 6, 'pawn', false], [4, 4, 'pawn', false],
];

const BOARD = 0.56;
const SQUARE = (BOARD - 2 * 0.0306) / 8;
const square = (f: number, r: number): [number, number] => [-BOARD / 2 + 0.0306 + (f + 0.5) * SQUARE, BOARD / 2 - 0.0306 - (r + 0.5) * SQUARE];

/** Café-height game table with a board inlay; chairs on ±x facing the table. */
export function BoardTable({ G, kind, seed = 0 }: G & { kind: 'chess' | 'checkers'; seed?: number }) {
  const m = G.m;
  const top = 0.74;
  const flip = seed % 2 ? -1 : 1;
  return (
    <group>
      <Cyl r={0.26} h={0.03} at={[0, 0.015, 0]} mat={G.darkSteel} seg={24} />
      <Cyl r={0.045} h={top - 0.06} at={[0, (top - 0.06) / 2 + 0.02, 0]} mat={G.darkSteel} seg={12} />
      <RBox size={[0.82, 0.045, 0.82]} at={[0, top - 0.0225, 0]} mat={m.darkWood} r={0.015} />
      <RBox size={[BOARD + 0.03, 0.012, BOARD + 0.03]} at={[0, top + 0.006, 0]} mat={m.cap} r={0.004} />
      <mesh position={[0, top + 0.0125, 0]} rotation-x={-PI / 2} material={kind === 'chess' ? G.chessBoard : G.checkersBoard} receiveShadow geometry={sharedGeometry('box', BOARD, BOARD, 0.001)} />
      {kind === 'chess'
        ? CHESS_POSITION.map(([f, r, k, white], i) => {
            const [x, z] = square(f, r);
            return <mesh key={i} geometry={lathe(k, 8)} material={white ? G.chessWhite : G.chessBlack} position={[x * flip, top + 0.013, z * flip]} />;
          })
        : Array.from({ length: 16 }, (_, i) => {
            const red = i < 8;
            const f = (i * 3 + seed) % 8;
            const r = red ? Math.floor(i / 4) : 6 + Math.floor((i - 8) / 4);
            const ff = (f + r) % 2 === 0 ? f : (f + 1) % 8;
            const [x, z] = square(ff, r);
            return <mesh key={i} geometry={sharedGeometry('cylinder', 0.027, 0.027, 0.012, 12)} material={red ? G.checkerRed : G.checkerBlack} position={[x, top + 0.019, z]} />;
          })}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.6, 0, 0]} rotation-y={-s * (PI / 2)}>
          <CafeChair m={m} />
        </group>
      ))}
    </group>
  );
}

/** 8-ball pool table: walnut body, green felt, cushions, six pockets, a cue, overhead lamp (balls: PoolBalls). */
export const BALL_COLORS = ['#facc15', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#16a34a', '#7f1d1d', '#111827', '#fde047', '#60a5fa', '#f87171', '#a78bfa', '#fdba74', '#4ade80', '#b45309'];
export const POOL_FELT_Y = 0.82;
export const BALL_R = 0.0286;

/** Racked balls (8-ball in the middle) plus the cue ball, in table-local coordinates. */
export function rackedBalls(): { x: number; z: number; color: string }[] {
  const others = BALL_COLORS.filter((_, i) => i !== 7);
  const out: { x: number; z: number; color: string }[] = [];
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let j = 0; j <= row; j++) out.push({ x: 0.55 + row * 0.05, z: (j - row / 2) * 0.058, color: row === 2 && j === 1 ? BALL_COLORS[7]! : others[k++ % others.length]! });
  out.push({ x: -0.62, z: 0.05, color: '#f8fafc' });
  return out;
}

export function PoolTable({ G, lampTop }: G & { lampTop: number }) {
  const m = G.m;
  const L = 2.84;
  const W = 1.62;
  const fy = POOL_FELT_Y;
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <RBox key={`${sx}${sz}`} size={[0.17, 0.66, 0.17]} at={[sx * 1.15, 0.33, sz * 0.58]} mat={m.darkWood} r={0.03} />))}
      <RBox size={[L - 0.12, 0.2, W - 0.12]} at={[0, 0.66, 0]} mat={m.darkWood} r={0.04} />
      <Box size={[L - 0.26, 0.03, W - 0.26]} at={[0, fy - 0.015, 0]} mat={G.felt} />
      {/* cushions and walnut rails */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[L - 0.4, 0.045, 0.05]} at={[0, fy + 0.02, s * (W / 2 - 0.155)]} mat={G.feltRail} />
          <Box size={[0.05, 0.045, W - 0.4]} at={[s * (L / 2 - 0.155), fy + 0.02, 0]} mat={G.feltRail} />
          <RBox size={[L, 0.07, 0.13]} at={[0, fy + 0.03, s * (W / 2 - 0.065)]} mat={m.darkWood} r={0.025} />
          <RBox size={[0.13, 0.07, W - 0.2]} at={[s * (L / 2 - 0.065), fy + 0.03, 0]} mat={m.darkWood} r={0.025} />
        </group>
      ))}
      {/* six pockets with brass rims */}
      {[
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 1],
        [0, 1],
        [1, 1],
      ].map(([px, pz], i) => (
        <group key={i} position={[px! * (L / 2 - 0.14), fy + 0.045, pz! * (W / 2 - 0.13)]}>
          <Cyl r={0.062} h={0.03} at={[0, 0, 0]} mat={G.pocket} seg={16} />
          <mesh rotation-x={-PI / 2} position-y={0.016} material={m.brass} geometry={sharedGeometry('torus', 0.062, 0.008, 6, 18)} />
        </group>
      ))}
      {/* cue resting on the rail */}
      <mesh geometry={sharedGeometry('cylinder', 0.006, 0.014, 1.45, 8)} material={m.lightWood} position={[-0.2, fy + 0.07, W / 2 - 0.05]} rotation={[0, 0.05, PI / 2]} castShadow />
      {/* overhead lamp hung from the pergola */}
      <RBox size={[1.7, 0.1, 0.42]} at={[0, lampTop - 0.95, 0]} mat={G.feltRail} r={0.03} />
      <Box size={[1.6, 0.012, 0.34]} at={[0, lampTop - 1.0, 0]} mat={G.lampUnder} />
      {[-0.6, 0.6].map((x) => (
        <Cyl key={x} r={0.008} h={0.9} at={[x, lampTop - 0.45, 0]} mat={G.darkSteel} seg={6} />
      ))}
    </group>
  );
}

/** Four-seat Ludo table with the board and a few tokens in play. */
export function LudoTable({ G }: G) {
  const m = G.m;
  const top = 0.74;
  const tokens: [number, number, keyof GamesMaterials['tokens']][] = [
    [-0.24, -0.24, 'red'],
    [0.08, -0.03, 'red'],
    [0.24, -0.24, 'green'],
    [-0.03, -0.18, 'green'],
    [0.24, 0.24, 'yellow'],
    [0.16, 0.03, 'yellow'],
    [-0.24, 0.24, 'blue'],
    [-0.1, 0.13, 'blue'],
  ];
  return (
    <group>
      <Cyl r={0.3} h={0.03} at={[0, 0.015, 0]} mat={G.darkSteel} seg={24} />
      <Cyl r={0.05} h={top - 0.06} at={[0, (top - 0.06) / 2 + 0.02, 0]} mat={G.darkSteel} seg={12} />
      <RBox size={[0.96, 0.045, 0.96]} at={[0, top - 0.0225, 0]} mat={m.lightWood} r={0.02} />
      <mesh position={[0, top + 0.002, 0]} rotation-x={-PI / 2} material={G.ludoBoard} receiveShadow geometry={sharedGeometry('box', 0.76, 0.76, 0.001)} />
      {tokens.map(([x, z, c], i) => (
        <mesh key={i} geometry={lathe('token', 8)} material={G.tokens[c]} position={[x, top + 0.003, z]} scale={0.05} />
      ))}
      <RBox size={[0.04, 0.04, 0.04]} at={[0.33, top + 0.02, -0.05]} mat={G.diceWhite} r={0.008} />
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation-y={(i * PI) / 2}>
          <group position={[0, 0, 0.66]} rotation-y={PI}>
            <CafeChair m={m} />
          </group>
        </group>
      ))}
    </group>
  );
}

/** Puzzle challenge table: puzzle mat and two seats on ±z. The hologram is separate (animated). */
export function PuzzleTable({ G }: G) {
  const m = G.m;
  const top = 0.74;
  return (
    <group>
      {[-1, 1].map((s) => (
        <RBox key={s} size={[0.06, top - 0.04, 0.6]} at={[s * 0.5, (top - 0.04) / 2, 0]} mat={G.darkSteel} r={0.01} />
      ))}
      <RBox size={[1.2, 0.045, 0.8]} at={[0, top - 0.0225, 0]} mat={m.deskWhite} r={0.02} />
      <mesh position={[0, top + 0.002, 0]} rotation-x={-PI / 2} material={G.puzzleMat} receiveShadow geometry={sharedGeometry('box', 0.9, 0.6, 0.001)} />
      <Box size={[0.9, 0.012, 0.02]} at={[0, top + 0.006, -0.31]} mat={G.cyanGlow} />
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * 0.62]} rotation-y={s > 0 ? PI : 0}>
          <CafeChair m={m} />
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ sculptural pieces

/** Knight silhouette (side view), extruded and bevelled: a giant chess knight in marble. */
function knightGeometry() {
  const s = new THREE.Shape();
  const pts: [number, number][] = [
    [-0.32, 0],
    [0.32, 0],
    [0.3, 0.12],
    [0.2, 0.2],
    [0.24, 0.42],
    [0.34, 0.66],
    [0.36, 0.86],
    [0.3, 1.0],
    [0.12, 1.12],
    [0.02, 1.2],
    [-0.04, 1.12],
    [-0.16, 1.06],
    [-0.36, 0.9],
    [-0.42, 0.8],
    [-0.38, 0.72],
    [-0.24, 0.72],
    [-0.1, 0.66],
    [-0.16, 0.5],
    [-0.24, 0.32],
    [-0.22, 0.2],
    [-0.3, 0.12],
  ];
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -0.15);
  return g;
}
let knight: THREE.ExtrudeGeometry | null = null;

export function KnightStatue({ G }: G) {
  const geo = (knight ??= knightGeometry());
  return (
    <group>
      <RBox size={[1.0, 0.36, 1.0]} at={[0, 0.18, 0]} mat={G.stone} r={0.04} />
      <Box size={[0.96, 0.02, 0.02]} at={[0, 0.3, 0.5]} mat={G.violetGlow} />
      <mesh geometry={lathe('plinth', 24)} material={G.marble} position={[0, 0.36, 0]} scale={[0.9, 0.7, 0.9]} castShadow receiveShadow />
      <mesh geometry={geo} material={G.marble} position={[0, 0.88, 0]} rotation-y={-PI / 2.6} castShadow receiveShadow />
    </group>
  );
}

/** Giant dice with pips on its visible faces. */
export function GiantDice({ G, size = 0.8 }: G & { size?: number }) {
  const h = size / 2;
  const pip = sharedGeometry('cylinder', size * 0.075, size * 0.075, 0.01, 16);
  const faces: { n: V3; up: 'x' | 'y' | 'z'; dots: [number, number][] }[] = [
    { n: [0, 1, 0], up: 'y', dots: [[-1, -1], [1, 1], [0, 0], [1, -1], [-1, 1]] },
    { n: [0, 0, 1], up: 'z', dots: [[-1, -1], [1, 1]] },
    { n: [1, 0, 0], up: 'x', dots: [[-1, -1], [0, 0], [1, 1]] },
    { n: [-1, 0, 0], up: 'x', dots: [[-1, -1], [1, -1], [-1, 1], [1, 1]] },
  ];
  return (
    <group position-y={h}>
      <RBox size={[size, size, size]} at={[0, 0, 0]} mat={G.diceWhite} r={size * 0.14} />
      {faces.flatMap((f, fi) =>
        f.dots.map(([a, b], i) => {
          const o = size * 0.24;
          const p: V3 = f.up === 'y' ? [a * o, h + 0.002, b * o] : f.up === 'z' ? [a * o, b * o, h * f.n[2] + 0.002 * f.n[2]] : [h * f.n[0] + 0.002 * f.n[0], b * o, a * o];
          const rot: V3 = f.up === 'y' ? [0, 0, 0] : f.up === 'z' ? [PI / 2, 0, 0] : [0, 0, PI / 2];
          return <mesh key={`${fi}-${i}`} geometry={pip} material={G.pip} position={p} rotation={rot} />;
        }),
      )}
    </group>
  );
}

export function GiantToken({ G, color, height = 1.1 }: G & { color: keyof GamesMaterials['tokens']; height?: number }) {
  return <mesh geometry={lathe('token', 24)} material={G.tokens[color]} scale={height} castShadow receiveShadow />;
}

/** Stack of oversized checkers (decor at the Checkers terrace). */
export function CheckerStack({ G }: G) {
  const disc = sharedGeometry('cylinder', 0.42, 0.42, 0.13, 32);
  const rim = sharedGeometry('torus', 0.36, 0.02, 6, 32);
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <group key={i} position={[i === 1 ? 0.05 : 0, 0.065 + i * 0.135, i === 2 ? -0.04 : 0]} rotation-y={i * 0.4}>
          <mesh geometry={disc} material={i % 2 ? G.checkerBlack : G.checkerRed} castShadow receiveShadow />
          <mesh geometry={rim} material={i % 2 ? G.checkerRed : G.checkerBlack} position-y={0.066} rotation-x={-PI / 2} />
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ lounge

function sectorGeometry(r0: number, r1: number, a0: number, a1: number, height: number, bevel: number) {
  const s = new THREE.Shape();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = Math.cos(a) * r1;
    const y = -Math.sin(a) * r1; // shape y → world −z after the rotation below
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    s.lineTo(Math.cos(a) * r0, -Math.sin(a) * r0);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: height - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelOffset: -bevel * 0.8, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, bevel);
  g.rotateX(-PI / 2);
  return g;
}

/**
 * Curved lounge sofa on an arc around a centre (0, 0): seat, back and arms as
 * extruded ring sectors, with seat and back cushions. Faces the centre.
 */
export function CurvedSofa({ G, fabric, radius, a0, a1, depth = 0.95 }: G & { fabric: THREE.Material; radius: number; a0: number; a1: number; depth?: number }) {
  const parts = useMemo(() => {
    const rIn = radius - depth / 2;
    const rOut = radius + depth / 2;
    const arm = 0.28 / radius;
    const n = 3;
    const step = (a1 - a0 - arm * 2) / n;
    return {
      base: sectorGeometry(rIn, rOut, a0, a1, 0.38, 0.05),
      back: sectorGeometry(rOut - 0.24, rOut, a0, a1, 0.98, 0.06),
      arms: [sectorGeometry(rIn, rOut, a0, a0 + arm, 0.72, 0.06), sectorGeometry(rIn, rOut, a1 - arm, a1, 0.72, 0.06)],
      seats: Array.from({ length: n }, (_, i) => sectorGeometry(rIn + 0.04, rOut - 0.26, a0 + arm + step * i + 0.01, a0 + arm + step * (i + 1) - 0.01, 0.16, 0.05)),
      backs: Array.from({ length: n }, (_, i) => sectorGeometry(rOut - 0.44, rOut - 0.24, a0 + arm + step * i + 0.012, a0 + arm + step * (i + 1) - 0.012, 0.42, 0.06)),
    };
  }, [radius, a0, a1, depth]);
  return (
    <group>
      <mesh geometry={parts.base} material={fabric} position-y={0.06} castShadow receiveShadow />
      <mesh geometry={parts.back} material={fabric} position-y={0.06} castShadow receiveShadow />
      {parts.arms.map((g, i) => (
        <mesh key={i} geometry={g} material={fabric} position-y={0.06} castShadow />
      ))}
      {parts.seats.map((g, i) => (
        <mesh key={i} geometry={g} material={fabric} position-y={0.44} castShadow receiveShadow />
      ))}
      {parts.backs.map((g, i) => (
        <mesh key={i} geometry={g} material={fabric} position-y={0.56} castShadow />
      ))}
      {/* small legs */}
      {[a0 + 0.04, (a0 + a1) / 2, a1 - 0.04].flatMap((a) =>
        [radius - depth / 2 + 0.08, radius + depth / 2 - 0.08].map((r) => <Cyl key={`${a}-${r}`} r={0.03} h={0.06} at={[Math.cos(a) * r, 0.03, Math.sin(a) * r]} mat={G.m.darkWood} seg={8} />),
      )}
    </group>
  );
}

// ------------------------------------------------------------------ signage & structure

/** Pill sign on a slim post, facing +Z. */
export function AreaSign({ G, material, height = 1.75 }: G & { material: THREE.Material; height?: number }) {
  return (
    <group>
      <Cyl r={0.045} h={height - 0.15} at={[0, (height - 0.15) / 2, 0]} mat={G.darkSteel} seg={10} />
      <Cyl r={0.16} h={0.04} at={[0, 0.02, 0]} mat={G.darkSteel} seg={16} />
      <RBox size={[2.36, 0.72, 0.1]} at={[0, height, 0]} mat={G.navy} r={0.08} />
      <mesh position={[0, height, 0.052]} material={material} geometry={sharedGeometry('box', 2.3, 0.67, 0.001)} />
    </group>
  );
}

/** Freestanding screen on twin legs, facing +Z. */
export function StandScreen({ G, material, w = 2.2, h = 1.3, y = 1.0 }: G & { material: THREE.Material; w?: number; h?: number; y?: number }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <RBox key={s} size={[0.08, y + h, 0.08]} at={[s * (w / 2 - 0.12), (y + h) / 2, -0.06]} mat={G.darkSteel} r={0.01} />
      ))}
      <RBox size={[w + 0.1, h + 0.1, 0.08]} at={[0, y + h / 2, 0]} mat={G.darkSteel} r={0.03} />
      <mesh position={[0, y + h / 2, 0.042]} material={material} geometry={sharedGeometry('box', w - 0.04, h - 0.04, 0.001)} />
      <Box size={[w, 0.02, 0.02]} at={[0, y - 0.02, 0.04]} mat={G.violetGlow} />
    </group>
  );
}

/** Raised terrace deck with glowing edges and steps on its open side. */
export function Deck({ G, w, d, h, open, top, edge }: G & { w: number; d: number; h: number; open: 'east' | 'west'; top: THREE.Material; edge: THREE.Material }) {
  const s = open === 'east' ? 1 : -1;
  return (
    <group>
      <RBox size={[w, h, d]} at={[0, h / 2, 0]} mat={top} r={0.02} shadow={false} />
      {/* glowing edge on the open side and the two ends */}
      <Box size={[0.04, 0.03, d - 0.1]} at={[s * (w / 2 - 0.03), h + 0.012, 0]} mat={edge} />
      {[-1, 1].map((e) => (
        <Box key={e} size={[w - 0.1, 0.03, 0.04]} at={[0, h + 0.012, e * (d / 2 - 0.03)]} mat={edge} />
      ))}
      {/* steps (full length of the open side) */}
      <RBox size={[0.32, h * 0.5, d - 1.2]} at={[s * (w / 2 + 0.16), h * 0.25, 0]} mat={G.deckStep} r={0.015} shadow={false} />
      {/* skirting light under the lip */}
      <Box size={[0.02, 0.02, d - 1.2]} at={[s * (w / 2 + 0.33), 0.02, 0]} mat={edge} />
    </group>
  );
}

/** Pergola: posts at the corners, perimeter beams, slats along X, optional string lights. */
export function Pergola({ G, w, d, h, slats = 0.5, lights = true }: G & { w: number; d: number; h: number; slats?: number; lights?: boolean }) {
  const posts: [number, number][] = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ];
  const bulbs = useMemo(() => {
    if (!lights) return [];
    const out: V3[] = [];
    for (let x = -w / 2 + 0.3; x <= w / 2 - 0.3; x += 0.55) out.push([x, h - 0.28 - Math.abs(Math.sin((x / w) * PI * 2)) * 0.12, d / 2 - 0.05]);
    return out;
  }, [w, d, h, lights]);
  return (
    <group>
      {posts.map(([x, z], i) => (
        <RBox key={i} size={[0.14, h, 0.14]} at={[x, h / 2, z]} mat={G.darkSteel} r={0.02} />
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[w + 0.2, 0.16, 0.12]} at={[0, h, s * (d / 2)]} mat={G.darkSteel} />
          <Box size={[0.12, 0.16, d + 0.2]} at={[s * (w / 2), h, 0]} mat={G.darkSteel} />
        </group>
      ))}
      {Array.from({ length: Math.floor(d / slats) }, (_, i) => (
        <Box key={i} size={[w, 0.07, 0.07]} at={[0, h + 0.1, -d / 2 + slats * (i + 0.5)]} mat={G.m.lightWood} />
      ))}
      {/* violet underglow along the front beam */}
      <Box size={[w, 0.02, 0.03]} at={[0, h - 0.09, d / 2 + 0.04]} mat={G.violetGlow} />
      {bulbs.map((p, i) => (
        <mesh key={i} position={p} material={G.warmBulb} geometry={sharedGeometry('sphere', 0.04, 8, 6)} />
      ))}
    </group>
  );
}
