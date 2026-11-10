import { useEffect, useMemo, useState, type MutableRefObject, type ReactNode } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, PerspectiveCamera } from '@react-three/drei';
import type { AvatarConfig, PublicHqProjection } from '@grooveli/frontend-domain/public';
import { Avatar } from '../Avatar';
import type { LabelPortal } from '../labels';
import type { InputState } from '../Player';
import { HQ_STATIONS, type Station } from '../../app/interiors';
import {
  BAYS,
  CLUSTERS,
  HQ,
  HQ_ANCHORS,
  HQ_BOUNDS,
  HQ_COLLIDERS,
  HQ_ITEMS,
  HQ_PLAYER_RADIUS,
  HQ_SPAWN,
  HQ_STAFF,
  HQ_WALL_ITEMS,
  PARTITIONS,
  ZONES,
  hqNavGrid,
  type FloorFinish,
  type Item,
} from '../../world/hq';
import { Sofa } from '../apartment/Furniture';
import { Interactive, SceneBackground } from '../interior/Interactive';
import { StaticBatch } from '../interior/StaticBatch';
import { Partitions, ZoneFloor, type ArchMaterials } from '../interior/architecture';
import { StaffMember } from '../interior/Staff';
import { useInteriorRig, type InteriorCameraConfig } from '../interior/useInteriorRig';
import { brandMaterials, daySkyTexture, makeHqMaterials, type HqMaterials } from './hqMaterials';
import {
  analyticsTexture,
  announcementsTexture,
  artTexture,
  cultureTexture,
  deptSignTexture,
  directoryTexture,
  hiringStepsTexture,
  hrInfoTexture,
  logoTexture,
  meetingScreenTexture,
  noticeboardTexture,
  onboardingTexture,
  rugTexture,
  scheduleTexture,
  screenTexture,
  vacanciesTexture,
  wayfindingTexture,
  whiteboardTexture,
} from './hqTextures';
import {
  Armchair,
  Bench,
  Books,
  Bookshelf,
  CafeChair,
  CafeTable,
  CareersWall,
  CoffeeTable,
  ConferenceTable,
  Credenza,
  CultureWall,
  Desk,
  DirectoryKiosk,
  ExecChair,
  ExecDesk,
  FilingCabinet,
  FloorLamp,
  GuestChair,
  HangingSign,
  HrCounter,
  InfoTotem,
  InterviewDesk,
  Kitchen,
  MeetingChair,
  Monolith,
  OfficeWindow,
  PendantDome,
  PendantLinear,
  Plant,
  Planter,
  Printer,
  ReceptionCounter,
  Rug,
  SecureCabinets,
  SmallPlant,
  SpeedGate,
  Stool,
  TallFridge,
  TallPlant,
  TaskChair,
  Tree,
  VideoBar,
  WallPanel,
  Whiteboard,
} from './OfficeFurniture';

/**
 * Elevated three-quarter cutaway camera, same lens and yaw as the apartment;
 * follows the player (the HQ is larger than one screen) with zoom and drag-pan.
 */
export const HQ_CAMERA: InteriorCameraConfig = {
  fov: 34,
  yawDeg: 45,
  pitchDeg: 43,
  distance: 18.5,
  minDistance: 7,
  maxDistance: 42,
  refAspect: 1328 / 799,
  lead: { x: -2.4, z: -2.8 },
  targetBounds: { minX: HQ.minX + 3, maxX: HQ.maxX - 3.5, minZ: HQ.minZ + 3, maxZ: HQ.maxZ - 3.5 },
};
const PI = Math.PI;

/** Demonstration identity when a building has no organisation data. */
const DEMO_HQ: PublicHqProjection = {
  organization: {
    id: 'demo-company',
    name: 'Demo Company',
    tagline: 'Demonstration data',
    logoColor: '#6a45d1',
    logoGlyph: 'D',
    industry: 'Demonstration',
    district: 'corporate',
    description: 'This headquarters is showing demonstration content because no organisation profile is linked to the building.',
    website: '',
    values: ['Demonstration'],
    culture: { environment: 'Demonstration data.', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' },
    benefits: [],
    workArrangements: ['hybrid'],
    size: '1-10',
    verified: false,
  },
  vacancies: [],
  departments: [],
  directory: [],
  announcements: [],
};

const FLOOR_TILE: Record<FloorFinish, number> = { wood: 1.45, walnut: 1.45, carpet: 2.0, stone: 1.8, tile: 1.6 };

function floorMat(m: HqMaterials, f: FloorFinish) {
  return f === 'wood' ? m.woodFloor : f === 'walnut' ? m.walnutFloor : f === 'carpet' ? m.carpet : f === 'stone' ? m.stone : m.terrazzo;
}

// ---------------------------------------------------------------- scene

export interface HqOfficeProps {
  avatar: AvatarConfig;
  hq: PublicHqProjection | null;
  input: MutableRefObject<InputState>;
  zoom: number;
  labels: boolean;
  reducedMotion: boolean;
  shadows: boolean;
  quality: 'low' | 'medium' | 'high';
  shadowMap: number;
  onPick: (s: Station) => void;
  onNearStation: (s: Station | null) => void;
  labelPortal: LabelPortal;
}

export function HqOffice({ avatar, hq: hqIn, input, zoom, labels, reducedMotion, shadows, quality, shadowMap, onPick, onNearStation, labelPortal }: HqOfficeProps) {
  const hq = hqIn ?? DEMO_HQ;
  const org = hq.organization;
  const m = useMemo(makeHqMaterials, []);
  const b = useMemo(() => brandMaterials(org.logoColor), [org.logoColor]);
  const arch = useMemo<ArchMaterials>(
    () => ({ darkFrame: m.darkFrame, glassPane: m.glassPane, frosted: m.frosted, stainless: m.stainless, aluminium: m.aluminium, dividerFabric: m.navyFabric, shell: m.charcoal, innerWall: m.officeWall, coping: m.stoneTop, trim: m.trim }),
    [m],
  );
  const T = useMemo(
    () => ({
      logo: logoTexture(org),
      logoDark: logoTexture(org, true),
      culture: cultureTexture(org),
      vacancies: vacanciesTexture(hq),
      how: hiringStepsTexture(org.logoColor),
      notices: announcementsTexture(hq),
      directory: directoryTexture(hq),
      hrInfo: hrInfoTexture(),
      onboarding: onboardingTexture(org.logoColor),
      analytics: analyticsTexture(org.logoColor),
      meeting: meetingScreenTexture(org),
      schedule: scheduleTexture(org.logoColor),
      noticeboard: noticeboardTexture(org),
      whiteboard: whiteboardTexture(),
      screens: [0, 1, 2, 3, 4, 5].map(screenTexture),
      art: [artTexture(1)],
      rugs: [rugTexture(0), rugTexture(1), rugTexture(2)],
      depts: BAYS.map((_, i) => deptSignTexture(hq.departments[i] ?? ['Team space', 'Project room', 'Hot desks'][i]!, org.logoColor)),
      wayLobby: wayfindingTexture([
        ['Workspace & departments', '↑'],
        ['HR & employee services', '↑'],
        ['Talent hub & lounge', '←'],
      ]),
      wayCorridor: wayfindingTexture([
        ['Executive office', '↑'],
        ['Conference room', '←'],
        ['Interview room · Lounge', '↓'],
      ]),
      services: wayfindingTexture([['Employee services', '↓']]),
    }),
    [hq, org],
  );
  useEffect(
    () => () => {
      Object.values(T).flat().forEach((t) => t.dispose());
    },
    [T],
  );

  const [hover, setHover] = useState<string | null>(null);
  const rig = useInteriorRig({
    camera: HQ_CAMERA,
    spawn: HQ_SPAWN,
    spawnHeading: PI,
    colliders: HQ_COLLIDERS,
    bounds: HQ_BOUNDS,
    radius: HQ_PLAYER_RADIUS,
    nav: hqNavGrid,
    anchors: HQ_ANCHORS,
    input,
    zoom,
    reducedMotion,
  });
  const { near, walkTo } = rig;
  const active = (id: string) => hover === id || near === id;
  useEffect(() => {
    onNearStation(near ? HQ_STATIONS.find((s) => s.id === near) ?? null : null);
  }, [near, onNearStation]);
  useEffect(() => () => onNearStation(null), [onNearStation]);

  const st = (id: string) => HQ_STATIONS.find((s) => s.id === id)!;
  const pick = (s: Station) => {
    walkTo(HQ_ANCHORS[s.id]!);
    onPick(s);
  };
  const ix = { labels, labelPortal, onPick: pick, onHover: setHover };
  const item = (id: string) => HQ_ITEMS.find((i) => i.id === id)!;
  const at = (i: Item, node: ReactNode) => (
    <group key={i.id} position={[i.x, 0, i.z]} rotation-y={i.rot}>
      {node}
    </group>
  );
  const tier = quality === 'low' ? 0 : quality === 'medium' ? 1 : 2;
  const chairFabric = [m.charcoalFabric, m.navyFabric, m.tealFabric, m.charcoalFabric, m.greyFabric];

  /** Static furniture (everything that is not a station object). */
  const staticItem = (i: Item, k: number): ReactNode => {
    switch (i.type) {
      case 'rug':
        return at(i, <Rug w={i.w} d={i.d} t={T.rugs[i.v ?? 0]!} />);
      case 'exec-chair':
        return at(i, <ExecChair m={m} />);
      case 'guest-chair':
        return at(i, <GuestChair m={m} fabric={m.sandFabric} />);
      case 'bookshelf':
        return at(i, <Bookshelf m={m} w={i.d} h={2.1} depth={i.w} />);
      case 'plant':
        return at(i, <Plant m={m} />);
      case 'tall-plant':
        return at(i, <TallPlant m={m} v={k} />);
      case 'floor-lamp':
        return at(i, <FloorLamp m={m} />);
      case 'conf-table':
        return at(i, <ConferenceTable m={m} len={i.w} w={i.d} />);
      case 'meeting-chair':
        return at(i, <MeetingChair m={m} fabric={i.id.startsWith('int') || i.id === 'rec-guest' ? m.mustardFabric : m.navyFabric} />);
      case 'waiting-chair':
        return at(i, <MeetingChair m={m} fabric={b.brandFabric} />);
      case 'credenza': {
        const len = Math.max(i.w, i.d);
        return at(
          i,
          <Credenza m={m} len={len} v={i.v}>
            {i.id === 'conf-credenza' ? (
              <>
                <SmallPlant m={m} at={[-len / 2 + 0.25, 0.64, 0]} />
                <Books at={[0.3, 0.64, 0]} n={3} rot={0.2} />
              </>
            ) : i.id === 'reception-credenza' ? (
              <>
                <Books at={[-0.7, 0.64, 0]} n={4} rot={-0.1} />
                <SmallPlant m={m} at={[0.8, 0.64, 0]} />
              </>
            ) : (
              <>
                <SmallPlant m={m} at={[-0.7, 0.64, 0]} />
                <SmallPlant m={m} at={[-0.35, 0.64, 0.05]} />
                <Books at={[0.5, 0.64, 0]} n={4} rot={0.3} />
              </>
            )}
          </Credenza>,
        );
      }
      case 'whiteboard':
        return at(i, <Whiteboard m={m} t={T.whiteboard} />);
      case 'interview-desk':
        return at(i, <InterviewDesk m={m} w={i.d} d={i.w} />);
      case 'fridge':
        return at(i, <TallFridge m={m} />);
      case 'kitchen':
        return at(i, <Kitchen m={m} len={i.d} />);
      case 'cafe-table':
        return at(i, <CafeTable m={m} />);
      case 'cafe-chair':
        return at(i, <CafeChair m={m} />);
      case 'armchair':
        return at(i, <Armchair m={m} fabric={i.id === 'lounge-armchair' ? m.mustardFabric : k % 2 ? m.tealFabric : m.mustardFabric} />);
      case 'coffee-table':
        return at(i, <CoffeeTable m={m} w={Math.min(i.w, i.d) === i.w ? i.w : i.d} d={Math.max(i.w, i.d)} />);
      case 'sofa':
        return at(i, <Sofa m={m} length={Math.max(i.w, i.d)} depth={Math.min(i.w, i.d)} fabric={i.id === 'lobby-sofa' ? m.navyFabric : m.terracottaFabric} seats={3} />);
      case 'desk':
        return at(i, <Desk m={m} w={i.w} d={i.d} v={i.v ?? k} screens={T.screens} />);
      case 'task-chair':
        return at(i, <TaskChair m={m} fabric={i.id === 'reception-chair' ? b.brandFabric : chairFabric[k % chairFabric.length]!} />);
      case 'printer':
        return at(i, <Printer m={m} />);
      case 'filing':
        return at(i, <FilingCabinet m={m} />);
      case 'stool':
        return at(i, <Stool m={m} />);
      default:
        return null;
    }
  };
  const STATION_ITEMS = new Set(['exec-desk', 'reception', 'culture-wall', 'info-totem', 'directory-kiosk', 'careers-wall', 'secure-cabinets', 'hr-counter', 'speed-gate', 'rec-desk']);

  const W = HQ_WALL_ITEMS;
  const wallX = HQ.minX + HQ.wallT / 2 + 0.002; // inner face of the west wall
  const wallZ = HQ.minZ + HQ.wallT / 2 + 0.002; // inner face of the north wall

  return (
    <group>
      <PerspectiveCamera ref={rig.cam} makeDefault fov={HQ_CAMERA.fov} near={0.5} far={250} position={[HQ_SPAWN.x + 11, 12, HQ_SPAWN.z + 11]} />
      <SceneBackground texture={daySkyTexture()} />

      {/* lighting: bright working-hours daylight, warm accents */}
      <hemisphereLight args={['#fffaf0', '#8c7a64', 1.05]} />
      <ambientLight intensity={0.16} color="#fff3e0" />
      <directionalLight
        position={[9, 16, 11]}
        intensity={1.55}
        color="#fff4e2"
        castShadow={shadows}
        shadow-mapSize={[Math.max(512, shadowMap), Math.max(512, shadowMap)]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <pointLight position={[6.7, 2.6, 4.2]} intensity={1.3} distance={9} decay={2} color="#ffd9a8" />
      <pointLight position={[0, 2.6, 0.7]} intensity={1.0} distance={9} decay={2} color="#fff0d8" />
      <pointLight position={[-7.4, 2.3, -1.1]} intensity={0.8} distance={6} decay={2} color="#ffd9a8" />
      <pointLight position={[-6.6, 2.4, 6.4]} intensity={0.9} distance={7} decay={2} color="#ffcf94" />

      <StaticBatch>
        {/* ---- exterior: lawn, paving apron, entrance, landscaping */}
        <mesh position={[0, -0.16, 0]} rotation-x={-PI / 2} material={m.grassLawn} receiveShadow>
          <circleGeometry args={[30, 64]} />
        </mesh>
        <mesh position={[0.6, -0.09, 1.0]} material={m.pavers} receiveShadow>
          <boxGeometry args={[23.5, 0.12, 21]} />
        </mesh>
        <mesh position={[6.7, -0.02, 8.75]} material={m.charcoal} receiveShadow>
          <boxGeometry args={[2.3, 0.02, 1.1]} />
        </mesh>
        <group position={[11.3, -0.03, -5.2]} rotation-y={PI / 2}>
          <Monolith m={m} logo={T.logo} brandGlow={b.brandGlow} />
        </group>
        {[4.3, 9.1].map((x) => (
          <group key={x} position={[x, -0.03, 9.1]}>
            <Planter m={m} w={1.3} d={0.6} />
          </group>
        ))}
        <group position={[1.0, -0.03, 9.5]}>
          <Bench m={m} />
        </group>
        {[
          [-8.5, 10.6, 1.1],
          [-3.2, 10.8, 0.9],
          [13.6, 5.5, 1.2],
          [13.2, -1.6, 1.0],
          [12.2, -9.8, 1.1],
          [-12.4, -2.0, 1.0],
          [-12.2, 6.5, 1.15],
        ].map(([x, z, s]) => (
          <group key={`${x}${z}`} position={[x!, -0.1, z!]}>
            <Tree m={m} s={s} />
          </group>
        ))}

        {/* ---- floor slab + zone finishes */}
        <mesh position={[0, -0.06, 0]} material={m.stoneTop} receiveShadow>
          <boxGeometry args={[HQ.maxX - HQ.minX + 0.2, 0.12, HQ.maxZ - HQ.minZ + 0.2]} />
        </mesh>
        {ZONES.map((z, i) => (
          <ZoneFloor key={i} rect={z.rect} mat={floorMat(m, z.floor)} tile={FLOOR_TILE[z.floor]} y={0.001 + i * 0.0002} />
        ))}

        {/* ---- walls, glass, dividers */}
        <Partitions m={arch} parts={PARTITIONS} wallT={HQ.wallT} />
        {W.northWindows.map(([a, c]) => (
          <group key={a} position={[(a + c) / 2, W.windowSill, wallZ]}>
            <OfficeWindow m={m} w={c - a} h={W.windowHeight} />
          </group>
        ))}
        {W.westWindows.map(([a, c]) => (
          <group key={a} position={[wallX, W.windowSill, (a + c) / 2]} rotation-y={PI / 2}>
            <OfficeWindow m={m} w={c - a} h={W.windowHeight} />
          </group>
        ))}

        {/* ---- wall decor */}
        <group position={[wallX, W.execArt.y, W.execArt.z]} rotation-y={PI / 2}>
          <WallPanel m={m} t={T.art[0]!} w={W.execArt.w} h={W.execArt.h} screen={false} frame={m.darkWood} />
        </group>
        <group position={[W.onboardingBoard.x, W.onboardingBoard.y, wallZ]}>
          <WallPanel m={m} t={T.onboarding} w={W.onboardingBoard.w} h={W.onboardingBoard.h} screen={false} frame={m.darkWood} />
        </group>
        <group position={[W.hrInfo.x, W.hrInfo.y, W.hrInfo.z]}>
          <WallPanel m={m} t={T.hrInfo} w={W.hrInfo.w} h={W.hrInfo.h} />
        </group>

        {/* ---- signage */}
        <group position={[6.7, 0, 2.05]}>
          <HangingSign m={m} t={T.logo} w={2.4} h={0.6} y={2.5} />
        </group>
        {BAYS.map((bx, i) =>
          i === 1 ? null : (
            <group key={bx} position={[bx, 0, -4.2]}>
              <HangingSign m={m} t={T.depts[i]!} w={1.6} h={0.4} y={2.45} />
            </group>
          ),
        )}
        <group position={[6.4, 0, -1.55]}>
          <HangingSign m={m} t={T.wayLobby} w={1.5} h={0.66} y={2.45} />
        </group>
        <group position={[-4.3, 0, -2.4]} rotation-y={PI / 4}>
          <HangingSign m={m} t={T.wayCorridor} w={1.4} h={0.62} y={2.45} />
        </group>
        <group position={[3.8, 0, -3.42]}>
          <HangingSign m={m} t={T.services} w={1.3} h={0.31} y={2.42} top={HQ.glassH} />
        </group>

        {/* ---- lighting fixtures */}
        {CLUSTERS.map(({ cx, cz }) => (
          <group key={cx} position={[cx, 0, cz]}>
            <PendantLinear m={m} len={2.3} y={2.3} />
          </group>
        ))}
        {BAYS.map((bx) => (
          <group key={bx} position={[bx, 0, -7.0]}>
            <PendantLinear m={m} len={1.8} y={2.4} />
          </group>
        ))}
        <group position={[7.6, 0, -6.2]}>
          <PendantLinear m={m} len={2.8} y={2.35} top={HQ.glassH} />
        </group>
        <group position={[8.7, 0, 5.4]} rotation-y={PI / 2}>
          <PendantLinear m={m} len={1.8} y={2.5} />
        </group>
        <group position={[1.2, 0, 5.6]}>
          <PendantLinear m={m} len={1.3} y={2.35} />
        </group>
        {[-8.2, -7.4, -6.6].map((x) => (
          <group key={x} position={[x, 0, -1.1]}>
            <PendantDome m={m} y={1.95} top={HQ.glassH} />
          </group>
        ))}
        <group position={[-7.7, 0, 6.2]}>
          <PendantDome m={m} y={1.85} mat={m.brass} />
        </group>
        <group position={[-7.6, 0, 3.0]}>
          <PendantDome m={m} y={1.95} top={HQ.glassH} />
        </group>
        <group position={[-7.7, 0, -6.25]}>
          <PendantDome m={m} y={2.05} top={HQ.glassH} mat={m.brass} />
        </group>
        <group position={[-5.3, 0, 6.75]}>
          <PendantDome m={m} y={1.95} mat={m.brass} />
        </group>

        {/* ---- benching privacy screens between back-to-back desks */}
        {CLUSTERS.map(({ cx, cz }) => (
          <group key={`scr${cx}`} position={[cx, 0, cz]}>
            <mesh position={[0, 0.95, 0]} material={m.navyFabric} castShadow>
              <boxGeometry args={[2.5, 0.4, 0.03]} />
            </mesh>
            <mesh position={[0, 1.155, 0]} material={m.aluminium}>
              <boxGeometry args={[2.5, 0.015, 0.035]} />
            </mesh>
          </group>
        ))}

        {/* ---- furniture */}
        {HQ_ITEMS.filter((i) => !STATION_ITEMS.has(i.type) && i.id !== 'rec-desk').map((i, k) => staticItem(i, k))}
      </StaticBatch>

      {/* ---- stations as real objects (kept out of the batch so they can glow) */}
      <Interactive station={st('reception')} active={hover === 'reception'} labelAt={[6.7, 1.75, 2.6]} {...ix}>
        {at(item('reception'), <ReceptionCounter m={m} w={3.0} d={0.8} brandGlow={b.brandGlow} logo={T.logo} screen={T.screens[4]!} glow={active('reception')} />)}
      </Interactive>
      <Interactive station={st('culture')} active={hover === 'culture'} labelAt={[3.9, 2.8, 0.5]} {...ix}>
        {at(item('culture-wall'), <CultureWall m={m} len={5.4} t={T.culture} brandGlow={b.brandGlow} logo={T.logo} />)}
      </Interactive>
      <Interactive station={st('announcements')} active={hover === 'announcements'} labelAt={[9.35, 2.3, 0.4]} {...ix}>
        {at(item('info-totem'), <InfoTotem m={m} t={T.notices} glow={active('announcements')} />)}
      </Interactive>
      <Interactive station={st('directory')} active={hover === 'directory'} labelAt={[4.6, 1.9, -1.15]} {...ix}>
        {at(item('directory-kiosk'), <DirectoryKiosk m={m} t={T.directory} glow={active('directory')} brandGlow={b.brandGlow} />)}
      </Interactive>
      <Interactive station={st('employees')} active={hover === 'employees'} labelAt={[6.35, 1.5, -2.2]} {...ix}>
        {HQ_ITEMS.filter((i) => i.type === 'speed-gate').map((i) => at(i, <SpeedGate m={m} />))}
      </Interactive>
      <Interactive station={st('careers')} active={hover === 'careers'} labelAt={[-1.4, 2.6, 4.4]} {...ix}>
        {at(item('careers-wall'), <CareersWall m={m} vac={T.vacancies} how={T.how} glow={active('careers')} brandGlow={b.brandGlow} />)}
      </Interactive>
      <Interactive station={st('recruitment')} active={hover === 'recruitment'} labelAt={[1.2, 1.6, 5.6]} {...ix}>
        {at(item('rec-desk'), <Desk m={m} w={1.3} d={0.7} v={7} screens={T.screens} glow={active('recruitment')} />)}
      </Interactive>
      <Interactive station={st('interview')} active={hover === 'interview'} labelAt={[-4.8, 1.9, W.scheduleTablet.z]} {...ix}>
        <group position={[W.scheduleTablet.x + 0.04, W.scheduleTablet.y, W.scheduleTablet.z]} rotation-y={PI / 2}>
          <WallPanel m={m} t={T.schedule} w={0.24} h={0.32} glow={active('interview')} />
        </group>
      </Interactive>
      <Interactive station={st('meeting')} active={hover === 'meeting'} labelAt={[-9.6, 2.45, W.conferenceScreen.z]} {...ix}>
        <group position={[wallX, W.conferenceScreen.y, W.conferenceScreen.z]} rotation-y={PI / 2}>
          <WallPanel m={m} t={T.meeting} w={W.conferenceScreen.w} h={W.conferenceScreen.h} glow={active('meeting')} />
          <group position={[0, W.conferenceScreen.h / 2 + 0.1, 0]}>
            <VideoBar m={m} />
          </group>
        </group>
      </Interactive>
      <Interactive station={st('departments')} active={hover === 'departments'} labelAt={[BAYS[1]!, 2.95, -4.2]} {...ix}>
        <group position={[BAYS[1]!, 0, -4.2]}>
          <HangingSign m={m} t={T.depts[1]!} w={1.6} h={0.4} y={2.45} />
        </group>
      </Interactive>
      <Interactive station={st('hr')} active={hover === 'hr'} labelAt={[3.8, 1.7, -3.4]} {...ix}>
        {at(item('hr-counter'), <HrCounter m={m} len={1.6} screen={T.screens[4]!} />)}
      </Interactive>
      <Interactive station={st('records')} active={hover === 'records'} labelAt={[4.1, 1.8, -7.6]} {...ix}>
        {at(item('hr-cabinets'), <SecureCabinets m={m} len={2.4} glow={active('records')} />)}
      </Interactive>
      <Interactive station={st('lounge')} active={hover === 'lounge'} labelAt={[-9.6, 2.2, W.noticeboard.z]} {...ix}>
        <group position={[wallX, W.noticeboard.y, W.noticeboard.z]} rotation-y={PI / 2}>
          <WallPanel m={m} t={T.noticeboard} w={W.noticeboard.w} h={W.noticeboard.h} screen={false} frame={m.darkWood} />
        </group>
      </Interactive>
      <Interactive station={st('management')} active={hover === 'management'} labelAt={[-7.7, 1.6, -6.3]} {...ix}>
        {at(item('exec-desk'), <ExecDesk m={m} w={1.9} d={0.85} screen={T.analytics} glow={active('management')} />)}
      </Interactive>

      {/* contextual indicator at the nearest / hovered station */}
      {Object.entries(HQ_ANCHORS)
        .filter(([id]) => active(id))
        .map(([id, a]) => (
          <mesh key={id} position={[a.x, 0.015, a.z]} rotation-x={-PI / 2}>
            <ringGeometry args={[0.32, 0.42, 36]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} toneMapped={false} />
          </mesh>
        ))}

      {/* walkable floor: click to route there */}
      <mesh
        position={[0, 0.003, 0]}
        rotation-x={-PI / 2}
        visible={false}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          walkTo({ x: e.point.x, z: e.point.z });
        }}
      >
        <planeGeometry args={[HQ.maxX - HQ.minX, HQ.maxZ - HQ.minZ]} />
      </mesh>

      {/* simulated staff (labelled as simulated in the HUD) */}
      <group ref={rig.crowd}>
        {HQ_STAFF.filter((s) => s.tier <= tier).map((s) => (
          <StaffMember key={s.id} spec={s} index={HQ_STAFF.indexOf(s)} reducedMotion={reducedMotion} />
        ))}
      </group>

      <group ref={rig.body}>
        <Avatar avatar={avatar} motion={rig.motion} still={reducedMotion} />
        <mesh position-y={0.012} rotation-x={-PI / 2}>
          <circleGeometry args={[0.3, 24]} />
          <meshBasicMaterial color="#1c140c" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      </group>

      <ContactShadows position={[0, 0.008, 0]} scale={[HQ.maxX - HQ.minX + 1, HQ.maxZ - HQ.minZ + 1]} resolution={1024} blur={2.4} far={2.2} opacity={0.42} frames={1} color="#2e2014" />
    </group>
  );
}
