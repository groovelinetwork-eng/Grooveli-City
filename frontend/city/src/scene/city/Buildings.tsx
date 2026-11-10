import { useState, useEffect, memo, useMemo, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { LabelPortal } from '../labels';
import { SIDEWALK_H, type PlacedBuilding, type Vec2, type CityFeatureId } from '../../world/layout';
import {
  careersSign,
  curtainTile,
  deckTexture,
  grooveliBillboard,
  hospitalSign,
  hqBillboard,
  jobBillboardWide,
  marketsBoard,
  nameSign,
  punchedTile,
  nightEmissive,
  repeatOf,
  ribbonTile,
  storefrontTile,
  topJobsBoard,
} from './textures';

const FLOOR = 3.4;
const BAY = 3.2;
const deg = (d: number) => (d * Math.PI) / 180;

interface BoxProps {
  w: number;
  h: number;
  d: number;
  y: number;
  tile: THREE.Texture;
  night: boolean;
  bay?: number;
  floor?: number;
  roof?: string;
  /** Only the south (+Z) face gets the tile; other faces use `side`. */
  side?: THREE.Texture;
  /** Daytime self-illumination of the tile (lit shop interiors). */
  glow?: number;
  /** Varies which windows are lit at night. */
  seed?: number;
}

/** A box whose four walls carry a façade tile repeated by floor and bay. */
function FacadeBox({ w, h, d, y, tile, night, bay = BAY, floor = FLOOR, roof = '#cfd5dd', side, glow = 0, seed = Math.round(w * 7 + h * 13 + d * 3) }: BoxProps) {
  const mats = useMemo(() => {
    const sideTile = side ?? tile;
    const face = (t: THREE.Texture, span: number, k: number) => {
      const rx = Math.max(1, Math.round(span / bay));
      const ry = Math.max(1, Math.round(h / floor));
      const map = repeatOf(t, rx, ry);
      const store = t.userData.windows === 'store';
      return new THREE.MeshStandardMaterial({
        map,
        roughness: 0.45,
        metalness: 0.1,
        emissive: night || (glow && t === tile) ? '#ffffff' : '#000000',
        // night: lit shop interiors, or a lit/dark window pattern unique to this building face
        emissiveMap: night ? nightEmissive(t, rx, ry, seed + k * 5) : glow && t === tile ? map : null,
        emissiveIntensity: night ? (store ? 0.75 : 0.92) : t === tile ? glow : 0,
      });
    };
    const top = new THREE.MeshStandardMaterial({ color: roof, roughness: 0.9 });
    return [face(sideTile, d, 1), face(sideTile, d, 2), top, top, face(tile, w, 3), face(sideTile, w, 4)];
  }, [w, h, d, tile, side, night, bay, floor, roof, glow, seed]);
  return (
    <mesh position-y={y + h / 2} material={mats} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
}

function Slab({ w, d, h = 0.4, y, color }: { w: number; d: number; h?: number; y: number; color: string }) {
  return (
    <mesh position-y={y + h / 2} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

/** A flat textured panel (billboard / sign) with a dark frame, facing +Z before rotation. */
/**
 * Signage leans back toward the camera by `tilt` degrees. At the reference's
 * 48° pitch a vertical board reads ~33 % squashed; real-world angled signage
 * plus this lean keeps billboard text legible like the reference.
 */
function Board({ map, w, h, position, rotY = 0, tilt = 14, frame = '#14213d', night, highlight = false }: { map: THREE.Texture; w: number; h: number; position: [number, number, number]; rotY?: number; tilt?: number; frame?: string; night: boolean; highlight?: boolean }) {
  return (
    <group position={position} rotation={[-deg(tilt), rotY, 0, 'YXZ']}>
      {/* interaction feedback: cyan halo around the frame + brighter face */}
      {highlight ? (
        <mesh position-z={-0.24}>
          <planeGeometry args={[w + 1.1, h + 1.1]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} toneMapped={false} />
        </mesh>
      ) : null}
      <mesh position-z={-0.12} castShadow>
        <boxGeometry args={[w + 0.4, h + 0.4, 0.2]} />
        <meshStandardMaterial color={frame} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={map} emissive="#ffffff" emissiveMap={map} emissiveIntensity={(night ? 0.95 : 0.42) + (highlight ? 0.3 : 0)} roughness={0.35} toneMapped={false} />
      </mesh>
    </group>
  );
}

function NamePlate({ b, y, night }: { b: PlacedBuilding; y: number; night: boolean }) {
  if (b.decor) return null;
  const map = nameSign(b.name, b.accent);
  const w = Math.min(b.w * 0.7, 12);
  const z = b.entrance && b.entrance.z < b.center.z ? -b.d / 2 - 0.06 : b.d / 2 + 0.06;
  return (
    <mesh position={[0, y, z]} rotation-y={z < 0 ? Math.PI : 0}>
      <planeGeometry args={[w, w / 8]} />
      <meshStandardMaterial map={map} emissive="#ffffff" emissiveMap={map} emissiveIntensity={night ? 0.8 : 0.25} />
    </mesh>
  );
}

function Canopy({ b, y, color = '#f8fafc' }: { b: PlacedBuilding; y: number; color?: string }) {
  const north = b.entrance && b.entrance.z < b.center.z;
  return (
    <mesh position={[0, y, north ? -b.d / 2 - 0.7 : b.d / 2 + 0.7]} castShadow>
      <boxGeometry args={[b.w * 0.92, 0.18, 1.4]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// ------------------------------------------------------------------ styles

function GlassOffice({ b, night, billboard }: { b: PlacedBuilding; night: boolean; billboard?: ReactNode }) {
  const podium = 4.2;
  return (
    <>
      <FacadeBox w={b.w} h={podium} d={b.d} y={0} tile={storefrontTile(b.accent, night)} bay={4} floor={podium} night={night} glow={0.55} />
      <Canopy b={b} y={podium + 0.05} />
      <NamePlate b={b} y={podium - 0.55} night={night} />
      <FacadeBox w={b.w - 0.8} h={b.h - podium} d={b.d - 0.8} y={podium} tile={curtainTile(b.accent, night)} night={night} />
      <Slab w={b.w - 0.3} d={b.d - 0.3} y={b.h} h={0.45} color="#f1f4f7" />
      {b.id === 'b-kestrel' || b.id === 'b-tech-tower' ? <Slab w={b.w - 1.4} d={b.d - 1.4} y={b.h + 0.3} h={0.2} color={night ? '#1d3d22' : '#5fae47'} /> : null}
      {billboard}
    </>
  );
}

/**
 * Global Markets: the façade board is an interactive entry point (hover
 * highlight, pointer cursor, click; the avatar's E prompt is handled by App via
 * the 'markets-board' interactable). `pulse` changes on every activation.
 */
function Markets({ b, night, near, pulse, onFeature }: { b: PlacedBuilding; night: boolean; near: boolean; pulse: number; onFeature?: (id: CityFeatureId) => void }) {
  const podium = 4.2;
  const upper = b.h - podium;
  const [hover, setHover] = useState(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!pulse) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 600);
    return () => window.clearTimeout(t);
  }, [pulse]);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  const board = (
    <group
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onFeature?.('markets-board');
      }}
    >
      <Board map={marketsBoard()} w={b.w * 0.9} h={upper * 0.72} position={[0, podium + upper * 0.44, b.d / 2 + 0.25]} night={night} highlight={hover || near || flash} />
    </group>
  );
  return <GlassOffice b={b} night={night} billboard={board} />;
}

function Hospital({ b, night }: { b: PlacedBuilding; night: boolean }) {
  const podium = 4.4;
  const upper = b.h - podium;
  return (
    <>
      <FacadeBox w={b.w} h={podium} d={b.d} y={0} tile={storefrontTile('#2563eb', night)} bay={4} floor={podium} night={night} glow={0.55} />
      <Canopy b={b} y={podium + 0.05} />
      <NamePlate b={b} y={podium - 0.55} night={night} />
      <FacadeBox w={b.w - 0.6} h={upper} d={b.d - 0.6} y={podium} tile={ribbonTile(b.body, b.accent, night)} night={night} />
      <Slab w={b.w - 0.2} d={b.d - 0.2} y={b.h} h={0.5} color="#f8fafc" />
      <Board map={grooveliBillboard()} w={b.w * 0.6} h={upper * 0.7} position={[-b.w * 0.12, podium + upper * 0.42, b.d / 2 + 0.25]} night={night} />
      {/* rooftop sign on legs */}
      {/* upright rooftop name sign on a steel frame */}
      <RooftopBillboard map={hospitalSign()} w={10.5} h={1.97} roofY={b.h} x={-b.w * 0.12} z={b.d / 2 - 1.6} frame="#7f1d1d" night={night} />
      {[-4, 4].map((x) => (
        <mesh key={x} position={[-b.w * 0.12 + x, b.h + 0.8, b.d / 2 - 1.4]}>
          <boxGeometry args={[0.2, 1.6, 0.2]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
    </>
  );
}

/**
 * Façade-mounted vertical sign (front faces +Z): a framed sign cabinet held off
 * the wall by steel stand-off brackets, with a lamp bar along the top.
 */
function WallSign({ map, w, h, x, y0, wallZ, night }: { map: THREE.Texture; w: number; h: number; x: number; y0: number; wallZ: number; night: boolean }) {
  const standoff = 0.55;
  const depth = 0.35;
  const z = wallZ + standoff + depth / 2;
  const yMid = y0 + h / 2;
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.6, roughness: 0.45 }), []);
  const lamp = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#ffe8a8', emissiveIntensity: night ? 2.6 : 0.3, toneMapped: false }), [night]);
  return (
    <group position-x={x}>
      {/* stand-off brackets: two per side, top and bottom thirds */}
      {[-1, 1].flatMap((sx) =>
        [0.18, 0.5, 0.82].map((fy) => (
          <mesh key={`${sx}${fy}`} position={[sx * (w / 2 - 0.35), y0 + h * fy, wallZ + standoff / 2]} material={steel} castShadow>
            <boxGeometry args={[0.16, 0.16, standoff]} />
          </mesh>
        )),
      )}
      {/* wall plates */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (w / 2 - 0.35), yMid, wallZ + 0.03]} material={steel}>
          <boxGeometry args={[0.3, h * 0.75, 0.06]} />
        </mesh>
      ))}
      {/* cabinet + frame + face */}
      <mesh position={[0, yMid, z]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.3, h + 0.3, depth]} />
        <meshStandardMaterial color="#14213d" metalness={0.35} roughness={0.5} />
      </mesh>
      <mesh position={[0, yMid, z + depth / 2 + 0.005]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={map} emissive="#ffffff" emissiveMap={map} emissiveIntensity={night ? 0.95 : 0.42} roughness={0.35} toneMapped={false} />
      </mesh>
      {/* lamp bar on two arms over the top edge */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * w * 0.3, y0 + h + 0.35, z + 0.35]} material={steel}>
          <boxGeometry args={[0.08, 0.08, 0.9]} />
        </mesh>
      ))}
      <mesh position={[0, y0 + h + 0.35, z + 0.78]} material={steel}>
        <boxGeometry args={[w * 0.8, 0.12, 0.18]} />
      </mesh>
      <mesh position={[0, y0 + h + 0.28, z + 0.78]} material={lamp}>
        <boxGeometry args={[w * 0.78, 0.03, 0.14]} />
      </mesh>
    </group>
  );
}

function SignTower({ b, night }: { b: PlacedBuilding; night: boolean }) {
  const podium = 4.2;
  return (
    <>
      <FacadeBox w={b.w} h={podium} d={b.d} y={0} tile={storefrontTile(b.accent, night)} bay={4} floor={podium} night={night} glow={0.55} />
      <FacadeBox w={b.w - 0.8} h={b.h - podium} d={b.d - 0.8} y={podium} tile={curtainTile('#3b82f6', night)} night={night} />
      <Slab w={b.w - 0.3} d={b.d - 0.3} y={b.h} h={0.5} color="#f1f4f7" />
      {/* upright vertical sign cabinet on stand-off brackets, mounted on the front façade (west side) */}
      <WallSign map={careersSign()} w={4.6} h={9.6} x={-b.w / 2 + 3.1} y0={podium + 1.4} wallZ={(b.d - 0.8) / 2} night={night} />
    </>
  );
}

function Mall({ b, night, topJobs }: { b: PlacedBuilding; night: boolean; topJobs: { title: string; count: number }[] }) {
  const deck = useMemo(() => repeatOf(deckTexture(night), b.w / 3, b.d / 3), [night, b.w, b.d]);
  const railMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.45 }), []);
  return (
    <>
      <FacadeBox
        w={b.w}
        h={b.h}
        d={b.d}
        y={0}
        tile={storefrontTile(b.accent, night)}
        side={ribbonTile(b.body, '#64748b', night)}
        bay={4}
        floor={b.h / 2}
        night={night}
        glow={0.6}
      />
      <NamePlate b={b} y={b.h / 2 - 0.4} night={night} />
      {/* awnings over each storey's shopfronts */}
      {[b.h / 2 - 0.05, b.h - 0.2].map((y) => (
        <mesh key={y} position={[0, y, b.d / 2 + 0.45]} castShadow>
          <boxGeometry args={[b.w, 0.16, 0.9]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
      ))}
      <mesh position={[0, b.h + 0.21, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[b.w - 0.4, b.d - 0.4]} />
        <meshStandardMaterial map={deck} roughness={0.9} />
      </mesh>
      {/* glass balustrade */}
      <mesh position={[0, b.h + 0.75, b.d / 2 - 0.1]} material={railMat}>
        <boxGeometry args={[b.w, 1, 0.08]} />
      </mesh>
      <mesh position={[0, b.h + 0.75, -b.d / 2 + 0.1]} material={railMat}>
        <boxGeometry args={[b.w, 1, 0.08]} />
      </mesh>
      <mesh position={[-b.w / 2 + 0.1, b.h + 0.75, 0]} material={railMat}>
        <boxGeometry args={[0.08, 1, b.d]} />
      </mesh>
      <mesh position={[b.w / 2 - 0.1, b.h + 0.75, 0]} material={railMat}>
        <boxGeometry args={[0.08, 1, b.d]} />
      </mesh>
      {/* Today's Top Jobs screen standing on the terrace */}
      {/* "Today's Top Jobs" screen: upright rooftop billboard in the terrace's reserved corner */}
      <RooftopBillboard map={topJobsBoard(topJobs)} w={12} h={6.6} roofY={b.h + 0.21} x={-b.w / 2 + 9.2} z={b.d / 2 - 5.2} frame="#0b1730" night={night} />
      {[-4, 4].map((x) => (
        <mesh key={x} position={[-b.w / 2 + 9.2 + x, b.h + 0.7, b.d / 2 - 4.6]}>
          <boxGeometry args={[0.25, 1.2, 0.25]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}
    </>
  );
}

function RoundTower({ b, night }: { b: PlacedBuilding; night: boolean }) {
  const r = Math.min(b.w, b.d) / 2;
  const podium = 4;
  const body = useMemo(() => {
    const tile = curtainTile(b.accent, night);
    const rx = Math.round((2 * Math.PI * r) / BAY);
    const ry = Math.round((b.h - podium) / FLOOR);
    const map = repeatOf(tile, rx, ry);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.15, emissive: night ? '#ffffff' : '#000000', emissiveMap: night ? nightEmissive(tile, rx, ry, 11) : null, emissiveIntensity: night ? 0.92 : 0 });
  }, [b.accent, b.h, night, r]);
  const base = useMemo(() => {
    const map = repeatOf(storefrontTile(b.accent, night), Math.round((2 * Math.PI * r) / 4), 1);
    return new THREE.MeshStandardMaterial({ map });
  }, [b.accent, night, r]);
  const floors = Math.floor((b.h - podium) / FLOOR);
  return (
    <>
      <mesh position-y={podium / 2} material={base} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, podium, 40]} />
      </mesh>
      <mesh position-y={podium + (b.h - podium) / 2} material={body} castShadow receiveShadow>
        <cylinderGeometry args={[r - 0.4, r - 0.4, b.h - podium, 40]} />
      </mesh>
      {Array.from({ length: floors }, (_, i) => (
        <mesh key={i} position-y={podium + (i + 1) * FLOOR - 0.6}>
          <cylinderGeometry args={[r - 0.25, r - 0.25, 0.22, 40]} />
          <meshStandardMaterial color="#f1f5f9" />
        </mesh>
      ))}
      <mesh position-y={b.h + 0.2} castShadow>
        <cylinderGeometry args={[r, r, 0.45, 40]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position-y={b.h + 0.45}>
        <cylinderGeometry args={[r - 0.7, r - 0.7, 0.12, 40]} />
        <meshStandardMaterial color={night ? '#1d3d22' : '#5fae47'} />
      </mesh>
      <NamePlate b={{ ...b, d: r * 2 }} y={podium - 0.6} night={night} />
    </>
  );
}

/**
 * Professionally mounted rooftop billboard (front faces +Z): vertical face
 * on two steel columns with rear diagonal bracing, service catwalk with
 * railing, gooseneck lamps over the face and a ribbed back panel.
 */
function RooftopBillboard({ map, w, h, roofY, z, x = 0, frame = '#14213d', night }: { map: THREE.Texture; w: number; h: number; roofY: number; z: number; x?: number; frame?: string; night: boolean }) {
  const clear = 1.5; // face bottom above the roof
  const yMid = roofY + clear + h / 2;
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.6, roughness: 0.45 }), []);
  const back = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.4, roughness: 0.6 }), []);
  const lampOn = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#ffe8a8', emissiveIntensity: night ? 2.6 : 0.3, toneMapped: false }), [night]);
  const colX = [-w * 0.3, w * 0.3];
  const lamps = Array.from({ length: 4 }, (_, i) => -w / 2 + (w * (i + 0.5)) / 4);
  return (
    <group position={[x, 0, z]}>
      {/* columns (roof to the top of the face) and rear braces */}
      {colX.map((x) => (
        <group key={x} position-x={x}>
          <mesh position={[0, roofY + (clear + h) / 2, -0.35]} material={steel} castShadow>
            <boxGeometry args={[0.28, clear + h, 0.28]} />
          </mesh>
          {/* diagonal brace: column at ~80 % height down to a roof footing 2.55 m behind */}
          <mesh position={[0, roofY + (clear + h) * 0.4, -1.62]} rotation-x={Math.atan2(2.55, (clear + h) * 0.8)} material={steel} castShadow>
            <boxGeometry args={[0.16, Math.hypot(2.55, (clear + h) * 0.8), 0.16]} />
          </mesh>
          <mesh position={[0, roofY + 0.12, -1.5]} material={steel}>
            <boxGeometry args={[0.5, 0.24, 2.8]} />
          </mesh>
        </group>
      ))}
      {/* horizontal back rails */}
      {[roofY + clear + 0.3, roofY + clear + h - 0.3].map((y) => (
        <mesh key={y} position={[0, y, -0.32]} material={steel} castShadow>
          <boxGeometry args={[w, 0.16, 0.16]} />
        </mesh>
      ))}
      {/* ribbed back panel + face frame */}
      <mesh position={[0, yMid, -0.2]} material={back} castShadow receiveShadow>
        <boxGeometry args={[w + 0.3, h + 0.3, 0.16]} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (w * (i + 0.5)) / 7, yMid, -0.3]} material={steel}>
          <boxGeometry args={[0.08, h + 0.2, 0.06]} />
        </mesh>
      ))}
      <mesh position={[0, yMid, -0.06]}>
        <boxGeometry args={[w + 0.3, h + 0.3, 0.12]} />
        <meshStandardMaterial color={frame} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, yMid, 0.005]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={map} emissive="#ffffff" emissiveMap={map} emissiveIntensity={night ? 0.95 : 0.4} roughness={0.35} toneMapped={false} />
      </mesh>
      {/* catwalk with railing along the bottom of the face */}
      <mesh position={[0, roofY + clear - 0.12, 0.45]} material={steel} castShadow>
        <boxGeometry args={[w + 0.3, 0.08, 0.9]} />
      </mesh>
      <mesh position={[0, roofY + clear + 0.45, 0.88]} material={steel}>
        <boxGeometry args={[w + 0.3, 0.05, 0.05]} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-w / 2 - 0.1 + ((w + 0.2) * i) / 5, roofY + clear + 0.2, 0.88]} material={steel}>
          <boxGeometry args={[0.05, 0.6, 0.05]} />
        </mesh>
      ))}
      {/* gooseneck lamps lighting the face from the catwalk */}
      {lamps.map((x) => (
        <group key={x} position={[x, roofY + clear - 0.05, 0.75]}>
          <mesh position={[0, 0.35, 0]} material={steel}>
            <boxGeometry args={[0.06, 0.7, 0.06]} />
          </mesh>
          <mesh position={[0, 0.72, -0.2]} rotation-x={0.9} material={lampOn}>
            <boxGeometry args={[0.36, 0.12, 0.22]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BillboardBlock({ b, night }: { b: PlacedBuilding; night: boolean }) {
  const podium = 4.2;
  return (
    <>
      <FacadeBox w={b.w} h={podium} d={b.d} y={0} tile={storefrontTile(b.accent, night)} bay={4} floor={podium} night={night} glow={0.55} />
      <Canopy b={b} y={podium + 0.05} />
      <NamePlate b={b} y={podium - 0.55} night={night} />
      <FacadeBox w={b.w - 0.6} h={b.h - podium} d={b.d - 0.6} y={podium} tile={curtainTile('#60a5fa', night)} night={night} roof="#8fa3bb" />
      <Slab w={b.w - 0.2} d={b.d - 0.2} y={b.h} h={0.3} color="#9fb2c8" />
      {/* recruiting advert: upright rooftop billboard on a steel frame, facing the main approach */}
      <RooftopBillboard map={jobBillboardWide()} w={Math.min(12.6, b.w - 2.4)} h={4.8} roofY={b.h + 0.3} z={b.d / 2 - 2.4} night={night} />
    </>
  );
}

function Tower({ b, night }: { b: PlacedBuilding; night: boolean }) {
  const podium = 5;
  return (
    <>
      <FacadeBox w={b.w} h={podium} d={b.d} y={0} tile={storefrontTile(b.accent, night)} bay={4} floor={podium} night={night} glow={0.55} />
      <NamePlate b={b} y={podium - 0.6} night={night} />
      <FacadeBox w={b.w - 1.4} h={b.h - podium} d={b.d - 1.4} y={podium} tile={curtainTile(b.accent === '#1e293b' ? '#475569' : b.body, night)} night={night} />
      <Slab w={b.w - 1} d={b.d - 1} y={b.h} h={0.6} color="#e2e8f0" />
      <Slab w={b.w * 0.4} d={b.d * 0.4} y={b.h + 0.6} h={1.6} color="#cbd5e1" />
    </>
  );
}

function Midrise({ b, night }: { b: PlacedBuilding; night: boolean }) {
  const podium = Math.min(4, b.h * 0.4);
  return (
    <>
      <FacadeBox w={b.w} h={podium} d={b.d} y={0} tile={storefrontTile(b.accent, night)} bay={4} floor={podium} night={night} glow={0.55} />
      <NamePlate b={b} y={podium - 0.5} night={night} />
      <FacadeBox w={b.w - 0.4} h={b.h - podium} d={b.d - 0.4} y={podium} tile={punchedTile(b.body, b.accent, night, b.seed)} night={night} />
      <Slab w={b.w} d={b.d} y={b.h} h={0.4} color="#e7e5e4" />
    </>
  );
}

function Civic({ b, night }: { b: PlacedBuilding; night: boolean }) {
  const cols = Math.max(4, Math.floor(b.w / 2));
  return (
    <>
      <FacadeBox w={b.w} h={b.h} d={b.d - 2} y={0} tile={ribbonTile(b.body, b.accent, night)} night={night} />
      {Array.from({ length: cols }, (_, i) => (
        <mesh key={i} position={[-b.w / 2 + 0.8 + (i * (b.w - 1.6)) / (cols - 1), b.h * 0.42, b.d / 2 - 0.6]} castShadow>
          <cylinderGeometry args={[0.32, 0.36, b.h * 0.84, 12]} />
          <meshStandardMaterial color="#f8f5ee" />
        </mesh>
      ))}
      <mesh position={[0, b.h * 0.9, b.d / 2 - 0.9]} castShadow>
        <boxGeometry args={[b.w, b.h * 0.18, 1.8]} />
        <meshStandardMaterial color="#f3ede0" />
      </mesh>
      <NamePlate b={b} y={b.h * 0.9} night={night} />
    </>
  );
}

function Shop({ b, night }: { b: PlacedBuilding; night: boolean }) {
  return (
    <>
      <FacadeBox w={b.w} h={b.h} d={b.d} y={0} tile={storefrontTile(b.accent, night)} side={punchedTile(b.body, b.accent, night, b.seed)} bay={3.5} floor={b.h} night={night} />
      <mesh position={[0, b.h * 0.72, b.d / 2 + 0.55]} rotation-x={deg(18)} castShadow>
        <boxGeometry args={[b.w * 0.95, 0.1, 1.2]} />
        <meshStandardMaterial color={b.accent} />
      </mesh>
      <Slab w={b.w} d={b.d} y={b.h} h={0.35} color="#e7e5e4" />
      <NamePlate b={b} y={b.h - 0.6} night={night} />
    </>
  );
}

export const Building = memo(function Building({
  b,
  night,
  topJobs,
  highlight,
  labels,
  labelPortal,
  onSelect,
  onGround,
  featureNear = false,
  featurePulse = 0,
  onFeature,
}: {
  b: PlacedBuilding;
  night: boolean;
  topJobs: { title: string; count: number }[];
  highlight: boolean;
  labels: boolean;
  labelPortal: LabelPortal;
  onSelect: (b: PlacedBuilding) => void;
  onGround: (p: Vec2) => void;
  /** Avatar is at this building's interactive feature (highlight it). */
  featureNear?: boolean;
  /** Increments on each activation of this building's feature (pulse). */
  featurePulse?: number;
  onFeature?: (id: CityFeatureId) => void;
}) {
  if (b.style === 'flat') return null;
  const body = (() => {
    switch (b.style) {
      case 'glassOffice':
        return <GlassOffice b={b} night={night} billboard={b.id === 'b-kestrel' ? <Board map={hqBillboard('Kestrel Systems')} w={b.w * 0.78} h={(b.h - 4.2) * 0.62} position={[-b.w * 0.04, 4.2 + (b.h - 4.2) * 0.42, b.d / 2 + 0.25]} night={night} /> : null} />;
      case 'markets':
        return <Markets b={b} night={night} near={featureNear} pulse={featurePulse} onFeature={onFeature} />;
      case 'hospital':
        return <Hospital b={b} night={night} />;
      case 'signTower':
        return <SignTower b={b} night={night} />;
      case 'mall':
        return <Mall b={b} night={night} topJobs={topJobs} />;
      case 'roundTower':
        return <RoundTower b={b} night={night} />;
      case 'billboardBlock':
        return <BillboardBlock b={b} night={night} />;
      case 'tower':
        return <Tower b={b} night={night} />;
      case 'civic':
        return <Civic b={b} night={night} />;
      case 'shop':
        return <Shop b={b} night={night} />;
      default:
        return <Midrise b={b} night={night} />;
    }
  })();
  return (
    <group
      position={[b.center.x, SIDEWALK_H, b.center.z]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (b.decor) onGround({ x: e.point.x, z: e.point.z });
        else onSelect(b);
      }}
    >
      {body}
      {b.entrance ? (
        <mesh position={[b.entrance.x - b.center.x, 0.03, b.entrance.z - b.center.z]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.7, 0.95, 40]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ) : null}
      {labels && highlight ? (
        <Html portal={labelPortal} position={[0, b.h + 2.4, 0]} center zIndexRange={[10, 0]} className="label label-building" aria-hidden="true">
          {b.name}
        </Html>
      ) : null}
    </group>
  );
});
