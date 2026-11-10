import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Interactive } from '../interior/Interactive';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { AvatarConfig } from '@grooveli/frontend-domain/public';
import { Avatar } from '../Avatar';
import type { LabelPortal } from '../labels';
import type { InputState } from '../Player';
import { APARTMENT_STATIONS, type Station } from '../../app/interiors';
import { APARTMENT_ANCHORS, APARTMENT_BOUNDS, APARTMENT_COLLIDERS, APARTMENT_SPAWN, FURNITURE, ROOM, WALL_ITEMS } from '../../world/apartment';
import { inputToRoom, seek, step } from '../../world/movement';
import type { Vec2 } from '../../world/layout';
import { makeApartmentMaterials, skyTexture, type ApartmentMaterials } from './materials';
import {
  Barrel,
  Basin,
  Bed,
  Bucket,
  Cooler,
  CvFolders,
  Desk,
  DiningChair,
  Door,
  GardenBed,
  Jar,
  JerryCans,
  Laptop,
  MiniFridge,
  OfficeChair,
  ParkingSign,
  Phone,
  Plant,
  RadioTable,
  Sconce,
  SideTable,
  Sofa,
  StatsDisplay,
  Toilet,
  TrophyShelf,
  WindowFrame,
} from './Furniture';

/**
 * Camera measured from refeerences/apartment-reference.png: elevated
 * three-quarter cutaway looking at the back corner, mild perspective, room
 * filling the frame at 1328×799. Interior only — the city keeps its ortho view.
 */
export const APT_CAMERA = { fov: 34, yawDeg: 45, pitchDeg: 41, distance: 17.9, target: [0.62, 0.2, -0.55] as [number, number, number], refAspect: 1328 / 799 };
const STATION_RADIUS = 1.35;
const WALK = 2.6;
const H = ROOM.half;

function useCameraFit() {
  const size = useThree((s) => s.size);
  return useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const d = APT_CAMERA.distance * Math.min(2.2, Math.max(1, APT_CAMERA.refAspect / aspect));
    const yaw = (APT_CAMERA.yawDeg * Math.PI) / 180;
    const pitch = (APT_CAMERA.pitchDeg * Math.PI) / 180;
    const [tx, ty, tz] = APT_CAMERA.target;
    return new THREE.Vector3(tx + Math.cos(pitch) * Math.sin(yaw) * d, ty + Math.sin(pitch) * d, tz + Math.cos(pitch) * Math.cos(yaw) * d);
  }, [size.width, size.height]);
}

function SkyBackground() {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const prev = scene.background;
    scene.background = skyTexture();
    return () => {
      scene.background = prev;
    };
  }, [scene]);
  return null;
}

/** A wall with plaster inner face, cream edge, dark wooden cap, trim and skirting. */
function Wall({ m, length, axis }: { m: ApartmentMaterials; length: number; axis: 'x' | 'z' }) {
  const t = ROOM.wallT;
  const h = ROOM.wallH;
  const mats = useMemo(() => [m.wall, m.wall, m.wallEdge, m.wallEdge, m.wallEdge, m.wallEdge], [m]);
  const along = (a: number, b: number, c: number): [number, number, number] => (axis === 'x' ? [a, b, c] : [c, b, a]);
  const size = (a: number, b: number, c: number): [number, number, number] => (axis === 'x' ? [a, b, c] : [c, b, a]);
  // axis 'x' = north wall (runs along X, inner face +Z); axis 'z' = west wall (runs along Z, inner face +X).
  const inner = t / 2 + 0.001;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} material={axis === 'x' ? [m.wallEdge, m.wallEdge, m.wallEdge, m.wallEdge, m.wall, m.wall] : mats} castShadow receiveShadow>
        <boxGeometry args={size(length, h, t)} />
      </mesh>
      <mesh position={[0, h + 0.05, 0]} material={m.cap} castShadow>
        <boxGeometry args={size(length + 0.06, 0.1, t + 0.08)} />
      </mesh>
      <mesh position={along(0, h - 0.07, inner + 0.01)} material={m.trim}>
        <boxGeometry args={size(length, 0.08, 0.02)} />
      </mesh>
      <mesh position={along(0, 0.05, inner + 0.01)} material={m.cap}>
        <boxGeometry args={size(length, 0.1, 0.02)} />
      </mesh>
    </group>
  );
}

export function Apartment({
  avatar,
  input,
  labels,
  reducedMotion,
  shadows,
  onPick,
  onNearStation,
  labelPortal,
}: {
  avatar: AvatarConfig;
  input: MutableRefObject<InputState>;
  labels: boolean;
  reducedMotion: boolean;
  shadows: boolean;
  onPick: (s: Station) => void;
  onNearStation: (s: Station | null) => void;
  labelPortal: LabelPortal;
}) {
  const m = useMemo(makeApartmentMaterials, []);
  const camPos = useCameraFit();
  const cam = useRef<THREE.PerspectiveCamera>(null);
  useLayoutEffect(() => {
    cam.current?.position.copy(camPos);
    cam.current?.lookAt(...APT_CAMERA.target);
  }, [camPos]);

  const [hover, setHover] = useState<string | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const active = (id: string) => hover === id || near === id;
  useEffect(() => {
    onNearStation(near ? APARTMENT_STATIONS.find((s) => s.id === near) ?? null : null);
  }, [near, onNearStation]);
  useEffect(() => () => onNearStation(null), [onNearStation]);

  // ---- walkable avatar
  const body = useRef<THREE.Group>(null);
  const motion = useRef(0);
  const frames = useRef(0);
  const state = useRef<{ pos: Vec2; target: Vec2 | null; heading: number }>({ pos: { ...APARTMENT_SPAWN }, target: null, heading: Math.PI / 4 });
  useFrame((_, dt) => {
    const p = state.current;
    const manual = inputToRoom(input.current);
    const moving = Math.hypot(manual.x, manual.z) > 0.05;
    if (moving) p.target = null;
    const dir = moving ? manual : seek(p.pos, p.target, 0.15);
    let walking = false;
    if (dir.x !== 0 || dir.z !== 0) {
      const next = step(p.pos, dir, dt, APARTMENT_COLLIDERS, WALK, APARTMENT_BOUNDS, 0.28);
      if (p.target && Math.hypot(next.x - p.pos.x, next.z - p.pos.z) < 1e-4) p.target = null;
      walking = Math.hypot(next.x - p.pos.x, next.z - p.pos.z) > 1e-4;
      p.pos = next;
      const want = Math.atan2(dir.x, dir.z);
      const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
      p.heading += reducedMotion ? diff : diff * Math.min(1, dt * 12);
    }
    motion.current = walking ? 1 : 0;
    // Hidden for the first frames so the one-shot contact-shadow bake only captures furniture.
    frames.current++;
    if (body.current) body.current.visible = frames.current > 3;
    body.current?.position.set(p.pos.x, 0, p.pos.z);
    if (body.current) body.current.rotation.y = p.heading;
    let best: string | null = null;
    let bestD = STATION_RADIUS;
    for (const [id, a] of Object.entries(APARTMENT_ANCHORS)) {
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      if (d < bestD) {
        best = id;
        bestD = d;
      }
    }
    if (best !== near) setNear(best);
  });

  const st = (id: string) => APARTMENT_STATIONS.find((s) => s.id === id)!;
  const f = (id: string) => FURNITURE.find((x) => x.id === id)!;
  const place = (id: string, node: ReactNode) => {
    const it = f(id);
    return (
      <group key={id} position={[it.x, 0, it.z]} rotation-y={it.rot}>
        {node}
      </group>
    );
  };
  const interact = { labels, labelPortal, onPick, onHover: setHover };
  const desk = f('desk');
  const side = f('side-table');
  const radio = f('radio-table');

  return (
    <group>
      <PerspectiveCamera ref={cam} makeDefault fov={APT_CAMERA.fov} near={0.5} far={200} position={camPos} />
      <SkyBackground />

      {/* lighting: warm fill, soft key with shadows, sconces */}
      <hemisphereLight args={['#fff1d6', '#7a5c3c', 1.15]} />
      <ambientLight intensity={0.18} color="#ffe2b8" />
      <directionalLight
        position={[3, 13, 7]}
        intensity={1.7}
        color="#fff0d8"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      <pointLight position={[0.2, 2.4, -0.6]} intensity={1.6} distance={9} decay={2} color="#ffd29a" />

      {/* exterior: island, cobble apron, garden beds, patio */}
      <mesh position={[0, -0.12, 0]} rotation-x={-Math.PI / 2} material={m.grass} receiveShadow>
        <circleGeometry args={[12.5, 72]} />
      </mesh>
      <mesh position={[0, -0.06, 0]} material={m.cobble} receiveShadow>
        <boxGeometry args={[H * 2 + 2.2, 0.1, H * 2 + 2.2]} />
      </mesh>
      {[
        [0.0, 6.35],
        [1.65, 6.35],
        [0.0, 8.15],
        [1.65, 8.15],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x!, -0.08, z!]}>
          <GardenBed m={m} w={1.45} d={1.6} />
        </group>
      ))}
      <mesh position={[7.4, -0.05, 3.4]} material={m.concrete} receiveShadow>
        <boxGeometry args={[3.6, 0.1, 4.2]} />
      </mesh>
      <mesh position={[7.4, -0.04, 3.4]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.62, 1.75, 4, 1, Math.PI / 4]} />
        <meshStandardMaterial color="#7a573d" />
      </mesh>
      <group position={[4.95, -0.02, 0.75]} rotation-y={0.6}>
        <ParkingSign m={m} />
      </group>

      {/* floor with plank finish and light edge trim on the open sides */}
      <mesh position={[0, -0.05, 0]} material={[m.trim, m.trim, m.floor, m.trim, m.trim, m.trim]} receiveShadow>
        <boxGeometry args={[H * 2, 0.1, H * 2]} />
      </mesh>
      <mesh position={[0, 0.005, H - 0.03]} material={m.lightWood}>
        <boxGeometry args={[H * 2, 0.012, 0.06]} />
      </mesh>
      <mesh position={[H - 0.03, 0.005, 0]} material={m.lightWood}>
        <boxGeometry args={[0.06, 0.012, H * 2]} />
      </mesh>

      {/* the two cutaway walls */}
      <group position={[0, 0, -H - ROOM.wallT / 2]}>
        <Wall m={m} length={H * 2 + ROOM.wallT * 2} axis="x" />
      </group>
      <group position={[-H - ROOM.wallT / 2, 0, 0]}>
        <Wall m={m} length={H * 2} axis="z" />
      </group>
      <group position={[-H + 0.005, 0, WALL_ITEMS.door.z]} rotation-y={Math.PI / 2}>
        <Door m={m} width={WALL_ITEMS.door.width} height={WALL_ITEMS.door.height} />
      </group>
      <group position={[WALL_ITEMS.window.x, WALL_ITEMS.window.sill, -H + 0.005]}>
        <WindowFrame m={m} width={WALL_ITEMS.window.width} height={WALL_ITEMS.window.height} />
      </group>
      {WALL_ITEMS.sconces.map((s, i) => (
        <group key={i} position={s.wall === 'west' ? [-H + 0.005, s.y, s.at] : [s.at, s.y, -H + 0.005]} rotation-y={s.wall === 'west' ? Math.PI / 2 : 0}>
          <Sconce m={m} light={i === 0} />
        </group>
      ))}

      {/* furniture (reference layout) */}
      {place('bed', <Bed m={m} width={1.7} length={2.2} />)}
      {place('sofa-green-back', <Sofa m={m} length={2.05} depth={0.92} fabric={m.greenFabric} />)}
      {place('chair-dining', <DiningChair m={m} />)}
      {place('chair-office', <OfficeChair m={m} />)}
      {place('cooler', <Cooler m={m} />)}
      {place('plant', <Plant m={m} />)}
      {place('fridge', <MiniFridge m={m} />)}
      {place('sofa-brown', <Sofa m={m} length={2.9} depth={1.06} fabric={m.brownFabric} seats={3} />)}
      {place('sofa-green-front', <Sofa m={m} length={2.25} depth={0.96} fabric={m.greenFabric} />)}
      {place('toilet', <Toilet m={m} />)}
      {place('basin', <Basin m={m} />)}
      {place('bucket', <Bucket m={m} />)}
      {place('jerrycans', <JerryCans m={m} />)}
      {place('barrel', <Barrel m={m} />)}

      {/* ---- stations as real objects ---- */}
      <Interactive station={st('desk')} active={hover === 'desk'} labelAt={[desk.x - 0.4, 1.35, desk.z]} {...interact}>
        {place('desk', <Desk m={m} width={1.5} depth={0.72} />)}
      </Interactive>
      <Interactive station={st('laptop')} active={hover === 'laptop'} labelAt={[desk.x + 0.25, 1.55, desk.z]} {...interact}>
        <group position={[desk.x + 0.15, 0.77, desk.z + 0.02]} rotation-y={-0.15}>
          <Laptop m={m} glow={active('laptop')} />
        </group>
      </Interactive>
      {place('side-table', <SideTable m={m} size={0.62} height={0.66} />)}
      <group position={[side.x + 0.14, 0.66, side.z - 0.05]}>
        <Jar />
      </group>
      <Interactive station={st('cv')} active={hover === 'cv'} labelAt={[side.x, 1.4, side.z]} {...interact}>
        <group position={[side.x - 0.15, 0.66, side.z + 0.05]} rotation-y={0.4}>
          <CvFolders m={m} />
        </group>
      </Interactive>
      {place('radio-table', <RadioTable m={m} />)}
      <Interactive station={st('phone')} active={hover === 'phone'} labelAt={[radio.x, 1.35, radio.z]} {...interact}>
        <group position={[radio.x - 0.02, 0.645, radio.z + 0.17]} rotation-y={0.5}>
          <Phone m={m} glow={active('phone')} />
        </group>
      </Interactive>
      <Interactive station={st('trophies')} active={hover === 'trophies'} labelAt={[-H + 0.3, WALL_ITEMS.trophyShelf.y + 0.6, WALL_ITEMS.trophyShelf.z]} {...interact}>
        <group position={[-H + 0.005, WALL_ITEMS.trophyShelf.y, WALL_ITEMS.trophyShelf.z]} rotation-y={Math.PI / 2}>
          <TrophyShelf m={m} width={WALL_ITEMS.trophyShelf.width} />
        </group>
      </Interactive>
      <Interactive station={st('stats')} active={hover === 'stats'} labelAt={[-H + 0.3, WALL_ITEMS.statsDisplay.y + 0.65, WALL_ITEMS.statsDisplay.z]} {...interact}>
        <group position={[-H + 0.005, WALL_ITEMS.statsDisplay.y, WALL_ITEMS.statsDisplay.z]} rotation-y={Math.PI / 2}>
          <StatsDisplay m={m} width={WALL_ITEMS.statsDisplay.width} height={WALL_ITEMS.statsDisplay.height} glow={active('stats')} />
        </group>
      </Interactive>

      {/* contextual indicator: glowing floor ring at the nearest / hovered station */}
      {Object.entries(APARTMENT_ANCHORS)
        .filter(([id]) => active(id))
        .map(([id, a]) => (
          <mesh key={id} position={[a.x, 0.012, a.z]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.32, 0.42, 36]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} toneMapped={false} />
          </mesh>
        ))}

      {/* walkable floor (click to walk) */}
      <mesh
        position={[0, 0.002, 0]}
        rotation-x={-Math.PI / 2}
        visible={false}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          state.current.target = { x: e.point.x, z: e.point.z };
        }}
      >
        <planeGeometry args={[H * 2, H * 2]} />
      </mesh>

      <group ref={body}>
        <Avatar avatar={avatar} motion={motion} still={reducedMotion} />
        <mesh position-y={0.008} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.3, 24]} />
          <meshBasicMaterial color="#2a1608" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      </group>

      <ContactShadows position={[0, 0.006, 0]} scale={H * 2 + 1} resolution={1024} blur={2.2} far={2.2} opacity={0.5} frames={1} color="#3a2410" />
    </group>
  );
}
