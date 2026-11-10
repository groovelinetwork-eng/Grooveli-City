import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { Box, Cyl, Lathe, RB, Laptop, Plant } from '../apartment/Furniture';
import type { HqMaterials } from './hqMaterials';

/**
 * Office furniture library for the company HQ. Same conventions as the
 * apartment kit: metres, each piece sits on y = 0 with its front (the side a
 * person uses) facing +Z, built from rounded / lathed / extruded primitives with
 * the shared PBR materials.
 */
type M = { m: HqMaterials };
type V3 = [number, number, number];
const PI = Math.PI;

/**
 * Shared materials so StaticBatch can merge small coloured props (books, mugs,
 * flowers) and identical screens into a handful of draw calls.
 */
const colorMats = new Map<string, THREE.MeshStandardMaterial>();
export function colorMat(color: string, roughness = 0.7) {
  const key = `${color}|${roughness}`;
  let mat = colorMats.get(key);
  if (!mat) colorMats.set(key, (mat = new THREE.MeshStandardMaterial({ color, roughness })));
  return mat;
}
const screenMats = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial[]>();
function screenMat(t: THREE.Texture, glow: boolean) {
  let pair = screenMats.get(t);
  if (!pair) {
    pair = [0.55, 0.95].map((i) => new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: i, roughness: 0.25 }));
    screenMats.set(t, pair);
  }
  return pair[glow ? 1 : 0]!;
}
const printMats = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial>();
function printMat(t: THREE.Texture) {
  let mat = printMats.get(t);
  if (!mat) printMats.set(t, (mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, transparent: true, alphaTest: 0.02 })));
  return mat;
}

/** Flat slab with rounded corners (table tops), extruded upward from y = at[1]. */
export function RoundedSlab({ w, d, h, r, mat, at }: { w: number; d: number; h: number; r: number; mat: THREE.Material; at: V3 }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -d / 2;
    const rr = Math.min(r, w / 2 - 0.001, d / 2 - 0.001);
    s.moveTo(x + rr, y);
    s.lineTo(x + w - rr, y);
    s.absarc(x + w - rr, y + rr, rr, -PI / 2, 0, false);
    s.lineTo(x + w, y + d - rr);
    s.absarc(x + w - rr, y + d - rr, rr, 0, PI / 2, false);
    s.lineTo(x + rr, y + d);
    s.absarc(x + rr, y + d - rr, rr, PI / 2, PI, false);
    s.lineTo(x, y + rr);
    s.absarc(x + rr, y + rr, rr, PI, PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(-PI / 2);
    return g;
  }, [w, d, h, r]);
  return <mesh geometry={geo} position={at} material={mat} castShadow receiveShadow />;
}

/** Emissive display surface (texture-mapped screen). */
export function Screen({ w, h, t, at, glow = false, rot }: { w: number; h: number; t: THREE.Texture; at: V3; glow?: boolean; rot?: V3 }) {
  return (
    <mesh position={at} rotation={rot} material={screenMat(t, glow)}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

/** Printed (non-emissive) panel surface. */
export function Print({ w, h, t, at, rot }: { w: number; h: number; t: THREE.Texture; at: V3; rot?: V3 }) {
  return (
    <mesh position={at} rotation={rot} material={printMat(t)} receiveShadow>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ desk equipment

export function Monitor({ m, t, w = 0.56, glow }: M & { t: THREE.Texture; w?: number; glow?: boolean }) {
  const h = w * 0.58;
  return (
    <group>
      <RB size={[0.22, 0.014, 0.17]} at={[0, 0.007, 0]} mat={m.darkFrame} r={0.006} />
      <Box size={[0.045, 0.3, 0.025]} at={[0, 0.16, -0.03]} mat={m.darkFrame} />
      <RB size={[w, h + 0.02, 0.022]} at={[0, 0.2 + h / 2, -0.01]} mat={m.blackPlastic} r={0.008} />
      <Screen w={w - 0.025} h={h - 0.01} t={t} at={[0, 0.2 + h / 2, 0.0015]} glow={glow} />
    </group>
  );
}

function Keyboard({ m, dark }: M & { dark: boolean }) {
  return (
    <group>
      <RB size={[0.42, 0.018, 0.13]} at={[0, 0.009, 0]} mat={dark ? m.blackPlastic : m.whitePlastic} r={0.006} />
      <Box size={[0.39, 0.004, 0.1]} at={[0, 0.019, 0.003]} mat={dark ? m.darkMetal : m.metal} />
      <mesh position={[0.3, 0.012, 0.01]} scale={[0.6, 0.35, 1]} rotation-x={PI / 2} material={dark ? m.blackPlastic : m.whitePlastic} castShadow>
        <capsuleGeometry args={[0.03, 0.04, 4, 8]} />
      </mesh>
    </group>
  );
}

export function DeskLamp({ m }: M) {
  return (
    <group>
      <Cyl r={0.07} h={0.02} at={[0, 0.01, 0]} mat={m.charcoal} />
      <Box size={[0.018, 0.34, 0.018]} at={[0, 0.17, -0.04]} mat={m.charcoal} rot={[0.3, 0, 0]} />
      <Box size={[0.018, 0.24, 0.018]} at={[0, 0.39, 0.03]} mat={m.charcoal} rot={[-0.9, 0, 0]} />
      <Cyl r={0.025} rTop={0.06} h={0.08} at={[0, 0.42, 0.14]} mat={m.charcoal} rot={[0.6, 0, 0]} />
      <mesh position={[0, 0.39, 0.165]} material={m.bulb}>
        <sphereGeometry args={[0.025, 8, 6]} />
      </mesh>
    </group>
  );
}

export function Mug({ color, at }: { color: string; at: V3 }) {
  return (
    <group position={at}>
      <mesh position={[0, 0.045, 0]} material={colorMat(color, 0.3)} castShadow>
        <cylinderGeometry args={[0.038, 0.034, 0.09, 14]} />
      </mesh>
      <mesh position={[0.042, 0.048, 0]} rotation-z={PI / 2} material={colorMat(color, 0.3)}>
        <torusGeometry args={[0.02, 0.006, 6, 10, PI]} />
      </mesh>
    </group>
  );
}

export function Books({ at, n = 4, rot = 0 }: { at: V3; n?: number; rot?: number }) {
  const cols = ['#2f5fb8', '#b65a3c', '#e9d6a8', '#2a7d7a', '#5d2f66', '#d39b2c'];
  return (
    <group position={at} rotation-y={rot}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[0, 0.012 + i * 0.026, 0]} rotation-y={(i % 2 ? 1 : -1) * 0.08} material={colorMat(cols[(i * 2 + n) % cols.length]!)} castShadow>
          <boxGeometry args={[0.22 - (i % 3) * 0.02, 0.024, 0.16]} />
        </mesh>
      ))}
    </group>
  );
}

export function SmallPlant({ m, at }: M & { at: V3 }) {
  return (
    <group position={at}>
      <Cyl r={0.05} rTop={0.06} h={0.09} at={[0, 0.045, 0]} mat={m.deskWhite} seg={12} />
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.3) * 0.03, 0.13 + (i % 2) * 0.03, Math.sin(i * 1.3) * 0.03]} rotation={[0.4, i * 1.3, 0]} scale={[0.03, 0.07, 0.012]} material={m.leaf} castShadow>
          <sphereGeometry args={[1, 6, 5]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Workstation desk, user side +Z. `v` varies the top finish, screens and
 * accessories so repeated desks never read as copies.
 */
export function Desk({ m, w, d, v, screens, glow }: M & { w: number; d: number; v: number; screens: THREE.Texture[]; glow?: boolean }) {
  const top = v % 4 < 2 ? m.lightWood : m.deskWhite;
  const dual = v % 3 === 0;
  const laptopOnly = v % 5 === 4;
  const scr = (k: number) => screens[(v + k) % screens.length]!;
  const mugs = ['#f8fafc', '#2f5fb8', '#e8603c', '#2a7d7a', '#d39b2c'];
  return (
    <group>
      <RB size={[w, 0.032, d]} at={[0, 0.734, 0]} mat={top} r={0.01} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w / 2 - 0.07), 0, 0]}>
          <Box size={[0.05, 0.7, 0.05]} at={[0, 0.36, 0]} mat={m.charcoal} />
          <Box size={[0.06, 0.025, d - 0.08]} at={[0, 0.0125, 0]} mat={m.charcoal} />
          <Box size={[0.05, 0.03, d - 0.12]} at={[0, 0.702, 0]} mat={m.charcoal} />
        </group>
      ))}
      <Box size={[w - 0.2, 0.3, 0.015]} at={[0, 0.5, -d / 2 + 0.06]} mat={m.charcoal} />
      {/* cable tray */}
      <Box size={[w - 0.3, 0.06, 0.12]} at={[0, 0.64, -d / 2 + 0.14]} mat={m.darkFrame} />
      {v % 2 === 0 ? (
        <group position={[w / 2 - 0.28, 0, -0.04]}>
          <RB size={[0.4, 0.56, 0.5]} at={[0, 0.3, 0]} mat={m.deskWhite} r={0.015} />
          {[0.47, 0.32, 0.14].map((y) => (
            <Box key={y} size={[0.16, 0.012, 0.012]} at={[0, y, 0.255]} mat={m.aluminium} />
          ))}
        </group>
      ) : null}
      {/* screens */}
      <group position={[0, 0.75, -d / 2 + 0.17]}>
        {laptopOnly ? (
          <group position={[0, 0, 0.12]}>
            <Laptop m={m} glow={!!glow} />
          </group>
        ) : dual ? (
          <>
            <group position={[-0.29, 0, 0.02]} rotation-y={0.18}>
              <Monitor m={m} t={scr(0)} w={0.52} glow={glow} />
            </group>
            <group position={[0.29, 0, 0.02]} rotation-y={-0.18}>
              <Monitor m={m} t={scr(1)} w={0.52} glow={glow} />
            </group>
          </>
        ) : (
          <Monitor m={m} t={scr(0)} w={0.6} glow={glow} />
        )}
      </group>
      {laptopOnly ? null : (
        <group position={[-0.04, 0.75, 0.1]}>
          <Keyboard m={m} dark={v % 2 === 1} />
        </group>
      )}
      <Mug color={mugs[v % mugs.length]!} at={[w / 2 - 0.16, 0.75, 0.12]} />
      {v % 4 === 1 ? (
        <group position={[-w / 2 + 0.16, 0.75, -0.12]} rotation-y={0.5}>
          <DeskLamp m={m} />
        </group>
      ) : null}
      {v % 3 === 1 ? <SmallPlant m={m} at={[-w / 2 + 0.14, 0.75, -0.18]} /> : null}
      {v % 3 === 2 ? <Books at={[-w / 2 + 0.2, 0.75, 0.08]} n={2 + (v % 3)} rot={0.3} /> : null}
      {v % 5 === 1 ? (
        <group position={[w / 2 - 0.3, 0.75, -0.2]} rotation-y={-0.4}>
          <RB size={[0.1, 0.13, 0.015]} at={[0, 0.065, 0]} mat={m.darkWood} r={0.004} rot={[-0.2, 0, 0]} />
        </group>
      ) : null}
    </group>
  );
}

// ------------------------------------------------------------------ seating

function StarBase({ m, legs = 5, mat }: M & { legs?: number; mat?: THREE.Material }) {
  return (
    <group>
      {Array.from({ length: legs }, (_, i) => (
        <group key={i} rotation-y={(i / legs) * PI * 2}>
          <Box size={[0.045, 0.035, 0.32]} at={[0, 0.07, 0.16]} mat={mat ?? m.charcoal} />
          <mesh position={[0, 0.03, 0.3]} material={m.blackPlastic} castShadow>
            <sphereGeometry args={[0.03, 8, 6]} />
          </mesh>
        </group>
      ))}
      <Cyl r={0.028} h={0.34} at={[0, 0.25, 0]} mat={mat ?? m.charcoal} seg={10} />
    </group>
  );
}

/** Ergonomic task chair: five-star base, gas lift, contoured seat and mesh-style back, armrests. */
export function TaskChair({ m, fabric }: M & { fabric: THREE.Material }) {
  return (
    <group>
      <StarBase m={m} mat={m.aluminium} />
      <RB size={[0.46, 0.03, 0.44]} at={[0, 0.42, 0]} mat={m.charcoal} r={0.01} />
      <RB size={[0.5, 0.08, 0.48]} at={[0, 0.47, 0.01]} mat={fabric} r={0.035} />
      <Box size={[0.06, 0.34, 0.035]} at={[0, 0.6, -0.235]} mat={m.charcoal} rot={[-0.08, 0, 0]} />
      <RB size={[0.46, 0.52, 0.06]} at={[0, 0.86, -0.27]} mat={fabric} r={0.03} rot={[-0.12, 0, 0]} />
      <RB size={[0.34, 0.12, 0.05]} at={[0, 0.7, -0.24]} mat={m.charcoal} r={0.02} rot={[-0.1, 0, 0]} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.27, 0, -0.02]}>
          <Box size={[0.03, 0.2, 0.03]} at={[0, 0.56, 0]} mat={m.charcoal} />
          <RB size={[0.07, 0.03, 0.24]} at={[0, 0.67, 0.02]} mat={m.blackPlastic} r={0.012} />
        </group>
      ))}
    </group>
  );
}

/** High-back executive chair in leather. */
export function ExecChair({ m }: M) {
  return (
    <group>
      <StarBase m={m} mat={m.stainless} />
      <RB size={[0.56, 0.11, 0.54]} at={[0, 0.48, 0.01]} mat={m.leather} r={0.045} />
      <RB size={[0.54, 0.82, 0.1]} at={[0, 0.98, -0.28]} mat={m.leather} r={0.05} rot={[-0.12, 0, 0]} />
      {[0.82, 1.02, 1.22].map((y) => (
        <Box key={y} size={[0.46, 0.012, 0.012]} at={[0, y, -0.22 - (y - 0.8) * 0.12]} mat={m.cap} rot={[-0.12, 0, 0]} />
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.31, 0, 0]}>
          <Box size={[0.03, 0.22, 0.03]} at={[0, 0.6, -0.05]} mat={m.stainless} />
          <RB size={[0.08, 0.04, 0.32]} at={[0, 0.72, -0.02]} mat={m.leather} r={0.015} />
        </group>
      ))}
    </group>
  );
}

/** Upholstered guest chair on an aluminium sled base with oak arms. */
export function GuestChair({ m, fabric }: M & { fabric: THREE.Material }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.25, 0, 0]}>
          <Box size={[0.025, 0.02, 0.5]} at={[0, 0.01, 0]} mat={m.aluminium} />
          <Box size={[0.025, 0.42, 0.025]} at={[0, 0.21, 0.23]} mat={m.aluminium} />
          <Box size={[0.025, 0.62, 0.025]} at={[0, 0.31, -0.23]} mat={m.aluminium} />
          <RB size={[0.05, 0.03, 0.46]} at={[0, 0.64, 0]} mat={m.lightWood} r={0.012} />
        </group>
      ))}
      <RB size={[0.48, 0.1, 0.48]} at={[0, 0.45, 0.01]} mat={fabric} r={0.04} />
      <RB size={[0.48, 0.42, 0.08]} at={[0, 0.74, -0.22]} mat={fabric} r={0.04} rot={[-0.14, 0, 0]} />
    </group>
  );
}

/** Meeting / interview chair: shell seat on a four-star swivel base. */
export function MeetingChair({ m, fabric }: M & { fabric: THREE.Material }) {
  return (
    <group>
      <StarBase m={m} legs={4} mat={m.aluminium} />
      <RB size={[0.46, 0.07, 0.44]} at={[0, 0.46, 0.01]} mat={fabric} r={0.03} />
      <RB size={[0.44, 0.36, 0.05]} at={[0, 0.72, -0.21]} mat={fabric} r={0.025} rot={[-0.14, 0, 0]} />
      <Box size={[0.04, 0.22, 0.02]} at={[0, 0.55, -0.2]} mat={m.aluminium} />
    </group>
  );
}

/** Bentwood café chair. */
export function CafeChair({ m }: M) {
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.016} rTop={0.02} h={0.45} at={[sx * 0.15, 0.225, sz * 0.15]} mat={m.darkWood} seg={8} />))}
      <Cyl r={0.21} h={0.035} at={[0, 0.46, 0]} mat={m.darkWood} seg={20} />
      {[-1, 1].map((s) => (
        <Cyl key={s} r={0.014} h={0.36} at={[s * 0.15, 0.65, -0.16]} mat={m.darkWood} seg={8} />
      ))}
      <mesh position={[0, 0.8, -0.16]} rotation-x={0} material={m.darkWood} castShadow>
        <torusGeometry args={[0.15, 0.016, 6, 16, PI]} />
      </mesh>
    </group>
  );
}

/** Mid-century lounge armchair. */
export function Armchair({ m, fabric }: M & { fabric: THREE.Material }) {
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.018} rTop={0.026} h={0.2} at={[sx * 0.32, 0.1, sz * 0.3]} mat={m.lightWood} seg={8} />))}
      <RB size={[0.78, 0.14, 0.76]} at={[0, 0.25, 0]} mat={fabric} r={0.05} />
      <RB size={[0.62, 0.14, 0.58]} at={[0, 0.38, 0.06]} mat={fabric} r={0.06} />
      <RB size={[0.76, 0.5, 0.16]} at={[0, 0.6, -0.3]} mat={fabric} r={0.07} rot={[-0.16, 0, 0]} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.1, 0.24, 0.7]} at={[s * 0.34, 0.42, 0]} mat={fabric} r={0.045} />
      ))}
    </group>
  );
}

export function Stool({ m }: M) {
  return (
    <group>
      <Cyl r={0.2} h={0.02} at={[0, 0.01, 0]} mat={m.charcoal} />
      <Cyl r={0.025} h={0.62} at={[0, 0.32, 0]} mat={m.aluminium} seg={10} />
      <mesh position={[0, 0.3, 0]} rotation-x={PI / 2} material={m.aluminium}>
        <torusGeometry args={[0.15, 0.01, 6, 20]} />
      </mesh>
      <Cyl r={0.19} h={0.06} at={[0, 0.66, 0]} mat={m.charcoalFabric} />
    </group>
  );
}

// ------------------------------------------------------------------ tables & storage

/** Executive desk in walnut with a brass-inlaid modesty panel facing visitors (+Z). */
export function ExecDesk({ m, w, d, screen, glow }: M & { w: number; d: number; screen: THREE.Texture; glow?: boolean }) {
  return (
    <group>
      <RB size={[w, 0.05, d]} at={[0, 0.735, 0]} mat={m.darkWood} r={0.015} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.06, 0.71, d - 0.04]} at={[s * (w / 2 - 0.04), 0.355, 0]} mat={m.darkWood} r={0.01} />
      ))}
      <RB size={[w - 0.1, 0.42, 0.04]} at={[0, 0.48, d / 2 - 0.08]} mat={m.darkWood} r={0.01} />
      <Box size={[w - 0.16, 0.012, 0.005]} at={[0, 0.55, d / 2 - 0.058]} mat={m.brass} />
      <RB size={[0.42, 0.55, d - 0.12]} at={[-w / 2 + 0.3, 0.3, -0.02]} mat={m.darkWood} r={0.01} />
      {[0.45, 0.25].map((y) => (
        <Box key={y} size={[0.14, 0.014, 0.014]} at={[-w / 2 + 0.3, y, -d / 2 + 0.04]} mat={m.brass} />
      ))}
      <Box size={[0.62, 0.006, 0.38]} at={[0.05, 0.763, -0.08]} mat={m.leather} />
      {/* screen faces the executive (−Z), angled so visitors glimpse it */}
      <group position={[0.42, 0.76, -0.12]} rotation-y={PI - 0.55}>
        <Monitor m={m} t={screen} w={0.62} glow={glow} />
      </group>
      <group position={[-0.62, 0.76, -0.2]} rotation-y={0.4}>
        <DeskLamp m={m} />
      </group>
      <Books at={[-0.62, 0.76, 0.18]} n={3} rot={-0.2} />
      <RB size={[0.26, 0.06, 0.05]} at={[0.05, 0.79, d / 2 - 0.12]} mat={m.brass} r={0.01} rot={[-0.4, 0, 0]} />
      <Mug color="#f8fafc" at={[0.75, 0.76, 0.12]} />
    </group>
  );
}

export function Bookshelf({ m, w, h, depth = 0.38 }: M & { w: number; h: number; depth?: number }) {
  const shelves = 5;
  const gap = (h - 0.1) / shelves;
  const cols = ['#2f5fb8', '#b65a3c', '#e9d6a8', '#2a7d7a', '#5d2f66', '#d39b2c', '#1f2330', '#c8b28a'];
  const cup = useMemo<[number, number][]>(() => [[0, 0], [0.05, 0], [0.05, 0.02], [0.015, 0.03], [0.015, 0.09], [0.06, 0.13], [0.065, 0.2], [0.058, 0.2], [0.05, 0.14], [0, 0.12]], []);
  return (
    <group>
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.03, h, depth]} at={[s * (w / 2 - 0.015), h / 2, 0]} mat={m.darkWood} />
      ))}
      <Box size={[w, h, 0.015]} at={[0, h / 2, -depth / 2 + 0.008]} mat={m.cap} />
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <Box key={i} size={[w - 0.03, 0.025, depth]} at={[0, 0.05 + i * gap, 0]} mat={m.darkWood} />
      ))}
      {Array.from({ length: shelves }, (_, row) => {
        const y = 0.0625 + row * gap;
        if (row === 2)
          return (
            <group key={row}>
              {[-0.3, 0, 0.3].map((x, i) => (
                <Lathe key={x} points={cup} at={[x * w, y, 0]} mat={m.brass} scale={i === 1 ? [1.4, 1.4, 1.4] : [1, 1, 1]} />
              ))}
              {[-0.15, 0.15].map((x) => (
                <RB key={x} size={[0.16, 0.2, 0.02]} at={[x * w, y + 0.1, -0.08]} mat={m.darkWood} r={0.004} rot={[-0.15, 0, 0]} />
              ))}
            </group>
          );
        const n = 9 + ((row * 3) % 5);
        let x = -w / 2 + 0.06;
        return (
          <group key={row}>
            {Array.from({ length: n }, (_, i) => {
              const bw = 0.03 + ((i * 7 + row) % 4) * 0.008;
              const bh = gap * (0.62 + ((i * 5 + row) % 4) * 0.07);
              const node = (
                <mesh key={i} position={[x + bw / 2, y + bh / 2, 0.02]} rotation-z={i === n - 1 ? 0.25 : 0} material={colorMat(cols[(i + row * 3) % cols.length]!, 0.75)} castShadow>
                  <boxGeometry args={[bw, bh, depth * 0.7]} />
                </mesh>
              );
              x += bw + 0.004;
              return node;
            })}
          </group>
        );
      })}
    </group>
  );
}

export function FloorLamp({ m }: M) {
  return (
    <group>
      <Cyl r={0.15} h={0.025} at={[0, 0.0125, 0]} mat={m.charcoal} />
      <Cyl r={0.012} h={1.45} at={[0, 0.74, 0]} mat={m.brass} seg={8} />
      <Cyl r={0.17} rTop={0.13} h={0.26} at={[0, 1.55, 0]} mat={m.linen} seg={20} />
      <mesh position={[0, 1.47, 0]} material={m.bulb}>
        <sphereGeometry args={[0.05, 10, 8]} />
      </mesh>
    </group>
  );
}

/** Fiddle-leaf fig in a ceramic planter. */
export function TallPlant({ m, v = 0 }: M & { v?: number }) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const a = i * 2.39996 + v;
        const y = 0.75 + (i / 26) * 0.95;
        const r = 0.12 + Math.sin(i * 0.7) * 0.05 + (1 - i / 26) * 0.12;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, y, ry: -a, rx: -0.9 + (i % 3) * 0.2 };
      }),
    [v],
  );
  return (
    <group>
      <Cyl r={0.17} rTop={0.21} h={0.42} at={[0, 0.21, 0]} mat={v % 2 ? m.charcoal : m.deskWhite} seg={24} />
      <Cyl r={0.2} h={0.02} at={[0, 0.42, 0]} mat={m.soil} />
      <Cyl r={0.02} h={1.0} at={[0, 0.9, 0]} mat={m.bark} seg={6} />
      {leaves.map((l, i) => (
        <mesh key={i} position={[l.x, l.y, l.z]} rotation={[l.rx, l.ry, 0, 'YXZ']} scale={[0.1, 0.018, 0.14]} material={m.leaf} castShadow>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

export { Plant };

/** Boat-shaped walnut conference table on twin pedestals, with conferencing puck. */
export function ConferenceTable({ m, len, w }: M & { len: number; w: number }) {
  return (
    <group>
      <RoundedSlab w={len} d={w} h={0.045} r={0.42} mat={m.darkWood} at={[0, 0.7, 0]} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.16, 0.7, w * 0.5]} at={[s * len * 0.28, 0.35, 0]} mat={m.charcoal} r={0.02} />
      ))}
      <Box size={[0.3, 0.004, 0.12]} at={[0, 0.752, 0]} mat={m.aluminium} />
      <Cyl r={0.1} h={0.03} at={[-0.45, 0.765, 0]} mat={m.charcoal} seg={24} />
      <mesh position={[-0.45, 0.781, 0]} rotation-x={-PI / 2} material={m.led}>
        <ringGeometry args={[0.07, 0.08, 24]} />
      </mesh>
      {[-0.8, 0, 0.8].flatMap((x) =>
        [-1, 1].map((s) => (
          <group key={`${x}${s}`} position={[x, 0.75, s * (w / 2 - 0.2)]} rotation-y={s > 0 ? 0 : PI}>
            <Box size={[0.16, 0.006, 0.22]} at={[0, 0.003, 0]} mat={m.whitePlastic} />
            <Cyl r={0.03} h={0.1} at={[0.14, 0.05, -0.05]} mat={m.glassPane} seg={10} />
          </group>
        )),
      )}
      <group position={[0.45, 0.75, -0.15]} rotation-y={0.4}>
        <Laptop m={m} glow={false} />
      </group>
    </group>
  );
}

export function Credenza({ m, len, v = 0, children }: M & { len: number; v?: number; children?: ReactNode }) {
  const body = v === 1 ? m.lightWood : m.darkWood;
  const doors = Math.max(2, Math.round(len / 0.5));
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.03, 0.08, 0.03]} at={[sx * (len / 2 - 0.06), 0.04, sz * 0.15]} mat={m.charcoal} />))}
      <RB size={[len, 0.56, 0.44]} at={[0, 0.36, 0]} mat={body} r={0.015} />
      {Array.from({ length: doors - 1 }, (_, i) => (
        <Box key={i} size={[0.006, 0.5, 0.005]} at={[-len / 2 + ((i + 1) * len) / doors, 0.36, 0.221]} mat={m.cap} />
      ))}
      {Array.from({ length: doors }, (_, i) => (
        <Box key={i} size={[0.012, 0.12, 0.012]} at={[-len / 2 + ((i + 0.5) * len) / doors + (i % 2 ? -0.18 : 0.18) * (len / doors), 0.46, 0.228]} mat={m.brass} />
      ))}
      {children}
    </group>
  );
}

export function Whiteboard({ m, t }: M & { t: THREE.Texture }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.68, 0, 0]}>
          <Box size={[0.035, 1.75, 0.035]} at={[0, 0.9, 0]} mat={m.aluminium} />
          <Box size={[0.04, 0.03, 0.48]} at={[0, 0.06, 0]} mat={m.aluminium} />
          {[-1, 1].map((z) => (
            <mesh key={z} position={[0, 0.03, z * 0.22]} material={m.blackPlastic}>
              <sphereGeometry args={[0.03, 8, 6]} />
            </mesh>
          ))}
        </group>
      ))}
      <RB size={[1.4, 0.92, 0.025]} at={[0, 1.32, 0]} mat={m.aluminium} r={0.01} />
      <Print w={1.36} h={0.88} t={t} at={[0, 1.32, 0.0135]} />
      <Box size={[1.2, 0.02, 0.07]} at={[0, 0.85, 0.04]} mat={m.aluminium} />
      {['#1f2937', '#dc2626', '#2563eb'].map((c, i) => (
        <mesh key={c} position={[-0.3 + i * 0.1, 0.87, 0.045]} rotation-z={PI / 2} material={colorMat(c, 0.5)}>
          <cylinderGeometry args={[0.01, 0.01, 0.12, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** Interview table; interviewer side −Z (laptop), candidate side +Z. */
export function InterviewDesk({ m, w, d }: M & { w: number; d: number }) {
  return (
    <group>
      <RoundedSlab w={w} d={d} h={0.035} r={0.08} mat={m.lightWood} at={[0, 0.71, 0]} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w / 2 - 0.12), 0, 0]}>
          <Box size={[0.04, 0.72, 0.04]} at={[0, 0.36, -d / 2 + 0.12]} mat={m.charcoal} rot={[0.08, 0, 0]} />
          <Box size={[0.04, 0.72, 0.04]} at={[0, 0.36, d / 2 - 0.12]} mat={m.charcoal} rot={[-0.08, 0, 0]} />
        </group>
      ))}
      <group position={[0.18, 0.755, -0.18]} rotation-y={PI}>
        <Laptop m={m} glow={false} />
      </group>
      <Box size={[0.21, 0.006, 0.3]} at={[-0.25, 0.75, -0.2]} mat={m.whitePlastic} rot={[0, 0.2, 0]} />
      <Box size={[0.24, 0.012, 0.32]} at={[0.05, 0.752, 0.22]} mat={m.blue} rot={[0, -0.15, 0]} />
      <Lathe points={[[0, 0], [0.05, 0], [0.055, 0.12], [0.03, 0.2], [0.035, 0.24], [0, 0.24]]} at={[-0.45, 0.75, 0]} mat={m.glassPane} seg={18} />
      {[-0.32, -0.55].map((x) => (
        <Cyl key={x} r={0.032} h={0.1} at={[x, 0.8, x === -0.32 ? 0.15 : -0.15]} mat={m.glassPane} seg={12} />
      ))}
    </group>
  );
}

export function TallFridge({ m }: M) {
  return (
    <group>
      <RB size={[0.6, 1.82, 0.6]} at={[0, 0.92, 0]} mat={m.stainless} r={0.03} />
      <Box size={[0.58, 0.008, 0.01]} at={[0, 1.2, 0.302]} mat={m.darkFrame} />
      {[1.45, 0.75].map((y) => (
        <Box key={y} size={[0.025, 0.42, 0.04]} at={[-0.24, y, 0.32]} mat={m.aluminium} />
      ))}
      <Box size={[0.56, 0.06, 0.02]} at={[0, 0.04, 0.3]} mat={m.darkFrame} />
    </group>
  );
}

/** Kitchenette run: base cabinets, stone worktop, sink, coffee machine, splashback, wall cabinets. */
export function Kitchen({ m, len }: M & { len: number }) {
  return (
    <group>
      <Box size={[len, 0.08, 0.54]} at={[0, 0.04, -0.02]} mat={m.charcoal} />
      <RB size={[len, 0.78, 0.58]} at={[0, 0.47, 0]} mat={m.deskWhite} r={0.01} />
      {Array.from({ length: Math.round(len / 0.45) - 1 }, (_, i) => (
        <Box key={i} size={[0.006, 0.72, 0.005]} at={[-len / 2 + ((i + 1) * len) / Math.round(len / 0.45), 0.47, 0.291]} mat={m.aluminium} />
      ))}
      <Box size={[len - 0.08, 0.012, 0.012]} at={[0, 0.78, 0.296]} mat={m.aluminium} />
      <RB size={[len + 0.02, 0.04, 0.62]} at={[0, 0.88, 0.01]} mat={m.stoneTop} r={0.008} />
      {/* sink + tap */}
      <Box size={[0.42, 0.012, 0.34]} at={[-len * 0.22, 0.897, 0.02]} mat={m.darkMetal} />
      <Cyl r={0.015} h={0.26} at={[-len * 0.22, 1.02, -0.2]} mat={m.stainless} seg={10} />
      <mesh position={[-len * 0.22, 1.15, -0.13]} rotation-y={PI / 2} material={m.stainless}>
        <torusGeometry args={[0.07, 0.013, 6, 12, PI]} />
      </mesh>
      {/* coffee machine + cups */}
      <group position={[len * 0.2, 0.9, -0.05]}>
        <RB size={[0.3, 0.4, 0.34]} at={[0, 0.2, 0]} mat={m.blackPlastic} r={0.03} />
        <Box size={[0.2, 0.02, 0.12]} at={[0, 0.02, 0.15]} mat={m.stainless} />
        <Box size={[0.08, 0.06, 0.04]} at={[0, 0.27, 0.17]} mat={m.stainless} />
        <mesh position={[0.08, 0.33, 0.171]}>
          <planeGeometry args={[0.08, 0.04]} />
          <meshStandardMaterial color="#60a5fa" emissive="#60a5fa" emissiveIntensity={1} toneMapped={false} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <Mug key={i} color="#f8fafc" at={[0.25 + (i % 2) * 0.09, 0, 0.1 - i * 0.08]} />
        ))}
      </group>
      <Cyl r={0.08} rTop={0.06} h={0.2} at={[len * 0.42, 1.0, -0.1]} mat={m.stainless} seg={16} />
      {/* splashback + wall cabinets with under-cabinet light */}
      <Box size={[len, 0.55, 0.015]} at={[0, 1.18, -0.29]} mat={m.terrazzo} />
      <RB size={[len, 0.62, 0.34]} at={[0, 1.84, -0.13]} mat={m.lightWood} r={0.01} />
      {Array.from({ length: Math.round(len / 0.45) - 1 }, (_, i) => (
        <Box key={i} size={[0.006, 0.56, 0.005]} at={[-len / 2 + ((i + 1) * len) / Math.round(len / 0.45), 1.84, 0.041]} mat={m.cap} />
      ))}
      <Box size={[len - 0.1, 0.012, 0.03]} at={[0, 1.52, 0.0]} mat={m.lightPanel} />
    </group>
  );
}

export function CafeTable({ m }: M) {
  return (
    <group>
      <Cyl r={0.25} h={0.025} at={[0, 0.0125, 0]} mat={m.charcoal} seg={24} />
      <Cyl r={0.035} h={0.71} at={[0, 0.37, 0]} mat={m.charcoal} seg={10} />
      <Cyl r={0.42} h={0.03} at={[0, 0.74, 0]} mat={m.marble} seg={32} />
      <Mug color="#f8fafc" at={[0.12, 0.755, 0.08]} />
      <Mug color="#e8603c" at={[-0.15, 0.755, -0.05]} />
    </group>
  );
}

export function CoffeeTable({ m, w, d }: M & { w: number; d: number }) {
  return (
    <group>
      <RoundedSlab w={w} d={d} h={0.035} r={0.12} mat={m.lightWood} at={[0, 0.38, 0]} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.02} h={0.38} at={[sx * (w / 2 - 0.07), 0.19, sz * (d / 2 - 0.07)]} mat={m.charcoal} seg={8} />))}
      <Box size={[w - 0.12, 0.02, d - 0.12]} at={[0, 0.12, 0]} mat={m.lightWood} />
      <Books at={[0.05, 0.42, -d * 0.2]} n={3} rot={0.4} />
      <Lathe points={[[0, 0], [0.05, 0], [0.07, 0.08], [0.04, 0.16], [0.045, 0.2], [0, 0.2]]} at={[-0.05, 0.42, d * 0.22]} mat={m.terracotta} seg={16} />
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.05 + Math.cos(i * 2.1) * 0.03, 0.66 + i * 0.02, d * 0.22 + Math.sin(i * 2.1) * 0.03]} material={colorMat(['#f9a8d4', '#fde68a', '#ffffff'][i]!)}>
          <sphereGeometry args={[0.04, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

export function Printer({ m }: M) {
  return (
    <group>
      <RB size={[0.55, 0.42, 0.56]} at={[0, 0.21, 0]} mat={m.greyFabric} r={0.015} />
      {[0.3, 0.14].map((y) => (
        <Box key={y} size={[0.5, 0.006, 0.005]} at={[0, y, 0.282]} mat={m.darkFrame} />
      ))}
      <RB size={[0.55, 0.36, 0.54]} at={[0, 0.6, 0]} mat={m.whitePlastic} r={0.02} />
      <Box size={[0.42, 0.06, 0.3]} at={[0, 0.66, 0.15]} mat={m.darkMetal} />
      <RB size={[0.55, 0.08, 0.5]} at={[0, 0.82, -0.02]} mat={m.greyFabric} r={0.015} />
      <group position={[0.18, 0.86, 0.22]} rotation-x={-0.6}>
        <RB size={[0.16, 0.1, 0.02]} at={[0, 0, 0]} mat={m.blackPlastic} r={0.006} />
        <mesh position={[0, 0, 0.011]}>
          <planeGeometry args={[0.13, 0.07]} />
          <meshStandardMaterial color="#1e3a8a" emissive="#60a5fa" emissiveIntensity={0.7} />
        </mesh>
      </group>
    </group>
  );
}

export function FilingCabinet({ m }: M) {
  return (
    <group>
      <RB size={[0.48, 1.05, 0.58]} at={[0, 0.525, 0]} mat={m.charcoal} r={0.012} />
      {[0.86, 0.53, 0.2].map((y) => (
        <group key={y}>
          <Box size={[0.44, 0.006, 0.005]} at={[0, y + 0.15, 0.291]} mat={m.darkFrame} />
          <Box size={[0.16, 0.02, 0.02]} at={[0, y, 0.3]} mat={m.aluminium} />
          <Box size={[0.08, 0.03, 0.004]} at={[0, y + 0.06, 0.292]} mat={m.whitePlastic} />
        </group>
      ))}
    </group>
  );
}

/** Lockable records cabinets with keypads (no contents visible). */
export function SecureCabinets({ m, len, glow }: M & { len: number; glow?: boolean }) {
  const n = 4;
  const w = len / n;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const x = -len / 2 + w * (i + 0.5);
        return (
          <group key={i} position={[x, 0, 0]}>
            <RB size={[w - 0.02, 1.36, 0.58]} at={[0, 0.68, 0]} mat={i % 2 ? m.charcoal : m.darkFrame} r={0.012} />
            {[1.05, 0.72, 0.39].map((y) => (
              <group key={y}>
                <Box size={[w - 0.08, 0.006, 0.005]} at={[0, y + 0.15, 0.291]} mat={m.cap} />
                <Box size={[0.18, 0.02, 0.02]} at={[0, y, 0.3]} mat={m.aluminium} />
              </group>
            ))}
            <RB size={[0.09, 0.13, 0.02]} at={[w / 2 - 0.12, 1.22, 0.3]} mat={m.blackPlastic} r={0.006} />
            <mesh position={[w / 2 - 0.12, 1.27, 0.312]} material={glow ? m.ledGreen : m.led}>
              <sphereGeometry args={[0.009, 8, 6]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** HR service counter, visitors +Z, staff −Z. */
export function HrCounter({ m, len, screen }: M & { len: number; screen: THREE.Texture }) {
  return (
    <group>
      <RB size={[len, 1.04, 0.08]} at={[0, 0.52, 0.24]} mat={m.slats} r={0.01} />
      <Box size={[len - 0.1, 0.02, 0.01]} at={[0, 0.1, 0.285]} mat={m.ledGreen} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.06, 1.04, 0.56]} at={[s * (len / 2 - 0.03), 0.52, 0]} mat={m.deskWhite} r={0.01} />
      ))}
      <RB size={[len + 0.06, 0.04, 0.38]} at={[0, 1.07, 0.14]} mat={m.stoneTop} r={0.008} />
      <RB size={[len - 0.1, 0.03, 0.4]} at={[0, 0.74, -0.08]} mat={m.deskWhite} r={0.008} />
      <group position={[0.25, 0.755, -0.05]} rotation-y={PI}>
        <Monitor m={m} t={screen} w={0.5} />
      </group>
      <Lathe points={[[0, 0], [0.04, 0], [0.04, 0.006], [0.03, 0.03], [0.006, 0.05], [0.004, 0.07], [0, 0.07]]} at={[-0.45, 1.09, 0.18]} mat={m.brass} seg={16} />
      <RB size={[0.16, 0.2, 0.08]} at={[0.55, 1.19, 0.2]} mat={m.glassPane} r={0.01} />
      {[0, 1, 2].map((i) => (
        <Box key={i} size={[0.13, 0.16, 0.006]} at={[0.55, 1.18 + i * 0.01, 0.17 + i * 0.02]} mat={i === 1 ? m.blue : m.whitePlastic} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ lobby & displays

/** Reception counter: slatted oak fascia, brand light line, logo plate, stone ledge, staff workstation behind. */
export function ReceptionCounter({ m, w, d, brandGlow, logo, screen, glow }: M & { w: number; d: number; brandGlow: THREE.Material; logo: THREE.Texture; screen: THREE.Texture; glow?: boolean }) {
  return (
    <group>
      <RB size={[w, 1.08, 0.12]} at={[0, 0.54, d / 2 - 0.06]} mat={m.slats} r={0.02} />
      <Box size={[w - 0.12, 0.025, 0.02]} at={[0, 0.08, d / 2 + 0.005]} mat={brandGlow} />
      <RB size={[1.36, 0.36, 0.025]} at={[0, 0.66, d / 2 + 0.012]} mat={m.charcoal} r={0.01} />
      <Print w={1.3} h={0.325} t={logo} at={[0, 0.66, d / 2 + 0.026]} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.12, 1.08, d]} at={[s * (w / 2 - 0.06), 0.54, 0]} mat={m.slats} r={0.02} />
      ))}
      <RB size={[w + 0.08, 0.045, 0.36]} at={[0, 1.105, d / 2 - 0.12]} mat={m.stoneTop} r={0.01} />
      <RB size={[w - 0.24, 0.035, d - 0.16]} at={[0, 0.74, -0.06]} mat={m.deskWhite} r={0.01} />
      {[-0.6, 0.55].map((x, i) => (
        <group key={x} position={[x, 0.76, -0.02]} rotation-y={PI + (i ? -0.2 : 0.2)}>
          <Monitor m={m} t={screen} w={0.5} glow={glow} />
        </group>
      ))}
      <group position={[0.05, 0.76, 0.0]}>
        <RB size={[0.2, 0.05, 0.16]} at={[0, 0.025, 0]} mat={m.blackPlastic} r={0.01} rot={[-0.2, 0, 0]} />
      </group>
      <Lathe points={[[0, 0], [0.04, 0], [0.04, 0.006], [0.03, 0.03], [0.006, 0.05], [0.004, 0.07], [0, 0.07]]} at={[0.9, 1.128, d / 2 - 0.12]} mat={m.brass} seg={16} />
      <group position={[-1.1, 1.128, d / 2 - 0.15]}>
        <Lathe points={[[0, 0], [0.06, 0], [0.08, 0.12], [0.05, 0.22], [0.055, 0.26], [0, 0.26]]} at={[0, 0, 0]} mat={m.glassPane} seg={16} />
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[Math.cos(i * 0.9) * 0.07, 0.36 + (i % 3) * 0.04, Math.sin(i * 0.9) * 0.07]} material={colorMat(['#f9a8d4', '#fde68a', '#ffffff', '#fb7185'][i % 4]!)}>
            <sphereGeometry args={[0.045, 8, 6]} />
          </mesh>
        ))}
        <Cyl r={0.006} h={0.2} at={[0, 0.27, 0]} mat={m.leaf} seg={4} />
      </group>
    </group>
  );
}

/** Freestanding touchscreen kiosk (employee directory). */
export function DirectoryKiosk({ m, t, glow, brandGlow }: M & { t: THREE.Texture; glow?: boolean; brandGlow: THREE.Material }) {
  return (
    <group>
      <RB size={[0.5, 0.05, 0.42]} at={[0, 0.025, 0]} mat={m.charcoal} r={0.015} />
      <RB size={[0.14, 0.95, 0.1]} at={[0, 0.5, -0.04]} mat={m.charcoal} r={0.02} />
      <group position={[0, 1.27, 0]} rotation-x={-0.32}>
        <RB size={[0.5, 0.68, 0.06]} at={[0, 0, 0]} mat={m.charcoal} r={0.02} />
        <Screen w={0.44} h={0.62} t={t} at={[0, 0, 0.031]} glow={glow} />
        <Box size={[0.44, 0.015, 0.02]} at={[0, 0.355, 0.0]} mat={brandGlow} />
      </group>
    </group>
  );
}

/** Freestanding digital information totem (portrait). */
export function InfoTotem({ m, t, glow }: M & { t: THREE.Texture; glow?: boolean }) {
  return (
    <group>
      <RB size={[1.0, 0.04, 0.4]} at={[0, 0.02, 0]} mat={m.charcoal} r={0.012} />
      <RB size={[0.92, 1.86, 0.12]} at={[0, 0.98, 0]} mat={m.blackPlastic} r={0.03} />
      <Screen w={0.84} h={1.68} t={t} at={[0, 1.0, 0.061]} glow={glow} />
    </group>
  );
}

/** Staff speed-gate cabinet (lane runs along Z). */
export function SpeedGate({ m }: M) {
  return (
    <group>
      <RB size={[0.16, 0.96, 1.0]} at={[0, 0.48, 0]} mat={m.stainless} r={0.03} />
      <Box size={[0.17, 0.02, 0.98]} at={[0, 0.965, 0]} mat={m.blackPlastic} />
      <mesh position={[0, 0.977, 0.3]} rotation-x={-PI / 2} material={m.ledGreen}>
        <circleGeometry args={[0.03, 12]} />
      </mesh>
      <RB size={[0.12, 0.08, 0.1]} at={[0, 0.98, -0.32]} mat={m.blackPlastic} r={0.02} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.012, 0.42, 0.34]} at={[s * 0.09, 0.72, 0.05]} mat={m.glassPane} />
      ))}
    </group>
  );
}

/** Freestanding culture wall (front +Z): slatted body, printed culture graphic, brand light line. */
export function CultureWall({ m, len, t, brandGlow, logo }: M & { len: number; t: THREE.Texture; brandGlow: THREE.Material; logo: THREE.Texture }) {
  return (
    <group>
      <RB size={[len, 0.1, 0.3]} at={[0, 0.05, 0]} mat={m.charcoal} r={0.01} />
      <RB size={[len, 2.32, 0.26]} at={[0, 1.26, 0]} mat={m.slats} r={0.02} />
      <RB size={[len - 0.3, 1.66, 0.02]} at={[0, 1.32, 0.14]} mat={m.charcoal} r={0.01} />
      <Print w={len - 0.4} h={(len - 0.4) * 0.35} t={t} at={[0, 1.32, 0.152]} />
      <Box size={[len - 0.3, 0.025, 0.02]} at={[0, 0.3, 0.14]} mat={brandGlow} />
      <Print w={1.2} h={0.3} t={logo} at={[len / 2 - 0.85, 2.27, 0.135]} />
    </group>
  );
}

/** Careers wall: freestanding slatted panel with vacancies screen and "How we hire" print. */
export function CareersWall({ m, vac, how, glow, brandGlow }: M & { vac: THREE.Texture; how: THREE.Texture; glow?: boolean; brandGlow: THREE.Material }) {
  return (
    <group>
      <RB size={[1.95, 0.12, 0.36]} at={[0, 0.06, 0]} mat={m.charcoal} r={0.012} />
      <RB size={[1.95, 2.2, 0.2]} at={[0, 1.2, 0]} mat={m.slats} r={0.02} />
      <RB size={[1.62, 0.94, 0.04]} at={[0, 1.6, 0.11]} mat={m.blackPlastic} r={0.012} />
      <Screen w={1.56} h={0.878} t={vac} at={[0, 1.6, 0.131]} glow={glow} />
      <RB size={[1.64, 0.53, 0.012]} at={[0, 0.78, 0.104]} mat={m.deskWhite} r={0.006} />
      <Print w={1.6} h={0.5} t={how} at={[0, 0.78, 0.111]} />
      <Box size={[1.9, 0.025, 0.02]} at={[0, 2.29, 0.09]} mat={brandGlow} />
    </group>
  );
}

/** Wall-mounted framed screen or board (front +Z). */
export function WallPanel({ m, t, w, h, glow, screen = true, frame }: M & { t: THREE.Texture; w: number; h: number; glow?: boolean; screen?: boolean; frame?: THREE.Material }) {
  return (
    <group>
      <RB size={[w + 0.06, h + 0.06, 0.04]} at={[0, 0, 0.02]} mat={frame ?? m.blackPlastic} r={0.012} />
      {screen ? <Screen w={w} h={h} t={t} at={[0, 0, 0.042]} glow={glow} /> : <Print w={w} h={h} t={t} at={[0, 0, 0.042]} />}
    </group>
  );
}

/** Video-conference bar (mounted under a screen). */
export function VideoBar({ m }: M) {
  return (
    <group>
      <RB size={[0.7, 0.07, 0.07]} at={[0, 0, 0.035]} mat={m.blackPlastic} r={0.03} />
      <Cyl r={0.022} h={0.01} at={[0, 0, 0.072]} mat={m.glassPane} rot={[PI / 2, 0, 0]} seg={14} />
      <mesh position={[0.06, 0, 0.072]} material={m.ledGreen}>
        <sphereGeometry args={[0.006, 6, 5]} />
      </mesh>
    </group>
  );
}

export function Rug({ w, d, t }: { w: number; d: number; t: THREE.Texture }) {
  return (
    <mesh position={[0, 0.006, 0]} receiveShadow>
      <boxGeometry args={[w, 0.012, d]} />
      <meshStandardMaterial map={t} roughness={1} />
    </mesh>
  );
}

/** Suspended sign panel with two cables up to the cut height. */
export function HangingSign({ m, t, w, h, y, top = 3.0 }: M & { t: THREE.Texture; w: number; h: number; y: number; top?: number }) {
  return (
    <group>
      <RB size={[w + 0.04, h + 0.04, 0.04]} at={[0, y, 0]} mat={m.charcoal} r={0.015} />
      <Print w={w} h={h} t={t} at={[0, y, 0.021]} />
      {[-1, 1].map((s) => (
        <Cyl key={s} r={0.004} h={top - y - h / 2} at={[s * w * 0.4, (top + y + h / 2) / 2, 0]} mat={m.darkMetal} seg={4} />
      ))}
    </group>
  );
}

/** Linear LED pendant with diffuser. */
export function PendantLinear({ m, len, y, top = 3.0 }: M & { len: number; y: number; top?: number }) {
  return (
    <group>
      <RB size={[len, 0.045, 0.1]} at={[0, y, 0]} mat={m.aluminium} r={0.02} />
      <mesh position={[0, y - 0.026, 0]} rotation-x={PI / 2} material={m.lightPanel}>
        <planeGeometry args={[len - 0.06, 0.09]} />
      </mesh>
      {[-1, 1].map((s) => (
        <Cyl key={s} r={0.004} h={top - y} at={[s * len * 0.42, (top + y) / 2, 0]} mat={m.darkMetal} seg={4} />
      ))}
    </group>
  );
}

export function PendantDome({ m, y, top = 3.0, mat }: M & { y: number; top?: number; mat?: THREE.Material }) {
  const pts = useMemo<[number, number][]>(() => [[0.02, 0.2], [0.06, 0.19], [0.17, 0.1], [0.21, 0.0], [0.2, -0.01]], []);
  return (
    <group>
      <Lathe points={pts} at={[0, y, 0]} mat={mat ?? m.charcoal} seg={28} />
      <mesh position={[0, y + 0.03, 0]} material={m.bulb}>
        <sphereGeometry args={[0.06, 12, 10]} />
      </mesh>
      <Cyl r={0.004} h={top - y - 0.2} at={[0, (top + y + 0.2) / 2, 0]} mat={m.darkMetal} seg={4} />
    </group>
  );
}

/** Office window on a wall (front +Z): daylight glazing, aluminium frame, mullions, sill, part-lowered blind. */
export function OfficeWindow({ m, w, h }: M & { w: number; h: number }) {
  const bays = Math.max(1, Math.round(w / 1.05));
  return (
    <group>
      <mesh position={[0, h / 2, 0.006]} material={m.daylight}>
        <planeGeometry args={[w, h]} />
      </mesh>
      <Box size={[w + 0.1, 0.07, 0.08]} at={[0, h + 0.035, 0.03]} mat={m.darkFrame} />
      <RB size={[w + 0.16, 0.05, 0.16]} at={[0, -0.02, 0.07]} mat={m.stoneTop} r={0.01} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.06, h, 0.08]} at={[s * (w / 2 + 0.03), h / 2, 0.03]} mat={m.darkFrame} />
      ))}
      {Array.from({ length: bays - 1 }, (_, i) => (
        <Box key={i} size={[0.04, h, 0.06]} at={[-w / 2 + ((i + 1) * w) / bays, h / 2, 0.03]} mat={m.darkFrame} />
      ))}
      <Box size={[w, 0.035, 0.05]} at={[0, h * 0.68, 0.03]} mat={m.darkFrame} />
      <RB size={[w - 0.04, h * 0.2, 0.025]} at={[0, h - h * 0.1, 0.075]} mat={m.blind} r={0.008} />
      <Box size={[w - 0.04, 0.03, 0.03]} at={[0, h - h * 0.2, 0.078]} mat={m.aluminium} />
    </group>
  );
}

// ------------------------------------------------------------------ exterior

export function Tree({ m, s = 1 }: M & { s?: number }) {
  return (
    <group scale={s}>
      <Cyl r={0.08} rTop={0.06} h={1.5} at={[0, 0.75, 0]} mat={m.bark} seg={8} />
      {[
        [0, 1.9, 0, 0.75],
        [0.35, 1.6, 0.15, 0.5],
        [-0.3, 1.7, -0.2, 0.55],
        [0.05, 2.4, -0.05, 0.5],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x!, y!, z!]} material={m.tree} castShadow>
          <icosahedronGeometry args={[r!, 1]} />
        </mesh>
      ))}
    </group>
  );
}

export function Planter({ m, w, d }: M & { w: number; d: number }) {
  return (
    <group>
      <RB size={[w, 0.5, d]} at={[0, 0.25, 0]} mat={m.charcoal} r={0.03} />
      <Box size={[w - 0.08, 0.02, d - 0.08]} at={[0, 0.49, 0]} mat={m.soil} />
      {Array.from({ length: Math.round(w * d * 14) }, (_, i) => (
        <mesh key={i} position={[(((i * 0.618) % 1) - 0.5) * (w - 0.2), 0.62 + (i % 3) * 0.04, (((i * 0.382) % 1) - 0.5) * (d - 0.2)]} material={m.leaf} castShadow>
          <icosahedronGeometry args={[0.13 + (i % 3) * 0.03, 0]} />
        </mesh>
      ))}
    </group>
  );
}

/** Entrance monolith sign with logo. */
export function Monolith({ m, logo, brandGlow }: M & { logo: THREE.Texture; brandGlow: THREE.Material }) {
  return (
    <group>
      <RB size={[1.5, 2.1, 0.3]} at={[0, 1.05, 0]} mat={m.charcoal} r={0.03} />
      <Print w={1.36} h={0.34} t={logo} at={[0, 1.55, 0.152]} />
      <Box size={[1.3, 0.025, 0.02]} at={[0, 0.35, 0.15]} mat={brandGlow} />
    </group>
  );
}

export function Bench({ m }: M) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.05, 0.42, 0.4]} at={[s * 0.7, 0.21, 0]} mat={m.charcoal} />
      ))}
      {[-0.14, -0.05, 0.04, 0.13].map((z) => (
        <RB key={z} size={[1.6, 0.04, 0.08]} at={[0, 0.44, z]} mat={m.lightWood} r={0.01} />
      ))}
    </group>
  );
}
