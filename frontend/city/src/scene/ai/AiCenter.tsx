import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { SKILL_CHALLENGES, type AvatarConfig } from '@grooveli/frontend-domain/public';
import { Avatar } from '../Avatar';
import type { LabelPortal } from '../labels';
import type { InputState } from '../Player';
import { AI_CENTER_STATIONS, type Station } from '../../app/interiors';
import {
  AI,
  AI_ANCHORS,
  AI_BOUNDS,
  AI_COLLIDERS,
  AI_ITEMS,
  AI_PARTITIONS,
  AI_PLAYER_RADIUS,
  AI_ROBOT_ROUTES,
  AI_SPAWN,
  AI_STAFF,
  AI_WALL_ITEMS,
  AI_ZONES,
  CORE,
  POD_X,
  aiNavGrid,
  type AiFloor,
  type AiItem,
} from '../../world/aiCenter';
import type { Vec2 } from '../../world/layout';
import { Plant, Sofa } from '../apartment/Furniture';
import { Interactive, SceneBackground } from '../interior/Interactive';
import { StaticBatch } from '../interior/StaticBatch';
import { Partitions, ZoneFloor, type ArchMaterials } from '../interior/architecture';
import { StaffMember } from '../interior/Staff';
import { useInteriorRig, type InteriorCameraConfig } from '../interior/useInteriorRig';
import { daySkyTexture } from '../hq/hqMaterials';
import { screenTexture, wayfindingTexture } from '../hq/hqTextures';
import { CoffeeTable, Desk, DirectoryKiosk, HangingSign, InfoTotem, InterviewDesk, MeetingChair, PendantLinear, Stool, TaskChair, Tree, WallPanel } from '../hq/OfficeFurniture';
import { makeAiMaterials, type AiMaterials } from './aiMaterials';
import { aiBrandTexture, certTexture, holoGridTexture, holoLabelTexture, intelligenceWallTexture, interviewScreenTexture, listScreenTexture, podScreenTexture, type AiVisitor } from './aiTextures';
import {
  AcousticPanel,
  AiCore,
  AiReceptionDesk,
  CameraTripod,
  CollabTable,
  CoreTerminal,
  FeedbackStand,
  HaloLight,
  HoloTable,
  IntelligenceWall,
  PodConsole,
  ServerRack,
  ServiceRobot,
  SlimTotem,
  TechColumn,
} from './AiFurniture';

/** Closer three-quarter cutaway than the HQ: the centre occupies most of the view. */
export const AI_CAMERA: InteriorCameraConfig = {
  fov: 34,
  yawDeg: 45,
  pitchDeg: 42,
  distance: 15.5,
  minDistance: 6,
  maxDistance: 34,
  refAspect: 1328 / 799,
  lead: { x: -2.5, z: -3.0 },
  targetBounds: { minX: -5, maxX: 4.5, minZ: -4, maxZ: 3.6 },
  lookY: 0.8,
};

const PI = Math.PI;
const FLOOR_TILE: Record<AiFloor, number> = { resin: 4, composite: 2, carpet: 2, acoustic: 2, wood: 1.45 };

function floorMat(m: AiMaterials, f: AiFloor) {
  return f === 'resin' ? m.resin : f === 'composite' ? m.compositeFloor : f === 'carpet' ? m.aiCarpet : f === 'acoustic' ? m.aiCarpet : m.woodFloor;
}

/** A service robot patrolling a ping-pong route (decorative). */
function PatrolRobot({ m, route, still }: { m: AiMaterials; route: Vec2[]; still: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const motion = useRef(0);
  const s = useRef({ i: 1, dir: 1, pos: { ...route[0]! }, wait: 1 });
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const st = s.current;
    if (still) {
      g.position.set(route[0]!.x, 0, route[0]!.z);
      motion.current = 0;
      return;
    }
    if (st.wait > 0) {
      st.wait -= dt;
      motion.current = 0;
    } else {
      const t = route[st.i]!;
      const dx = t.x - st.pos.x;
      const dz = t.z - st.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        if (st.i + st.dir < 0 || st.i + st.dir >= route.length) {
          st.dir = -st.dir;
          st.wait = 3;
        }
        st.i += st.dir;
      } else {
        const v = Math.min(d, 0.7 * Math.min(dt, 0.1));
        st.pos.x += (dx / d) * v;
        st.pos.z += (dz / d) * v;
        const want = Math.atan2(dx, dz);
        g.rotation.y += Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y)) * Math.min(1, dt * 6);
      }
      motion.current = d < 0.05 ? 0 : 1;
    }
    g.position.set(st.pos.x, 0, st.pos.z);
  });
  return (
    <group ref={ref}>
      <ServiceRobot m={m} still={still} motion={motion} />
    </group>
  );
}

export interface AiCenterProps {
  avatar: AvatarConfig;
  visitor: AiVisitor;
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

export function AiCenter({ avatar, visitor, input, zoom, labels, reducedMotion, shadows, quality, shadowMap, onPick, onNearStation, labelPortal }: AiCenterProps) {
  const m = useMemo(makeAiMaterials, []);
  const arch = useMemo<ArchMaterials>(
    () => ({ darkFrame: m.navy, glassPane: m.glassPane, frosted: m.frosted, stainless: m.brushed, aluminium: m.brushed, dividerFabric: m.tealFelt, shell: m.slate, innerWall: m.aiWall, coping: m.whiteComposite, trim: m.softCyan }),
    [m],
  );
  const T = useMemo(() => {
    const skills = SKILL_CHALLENGES.map((c) => c.skill);
    return {
      intel: intelligenceWallTexture(visitor),
      pods: [
        podScreenTexture('Career guidance', ['Explore roles', 'Set goals', 'Ask the assistant'], visitor, '#14b8a6'),
        podScreenTexture('CV & profile', ['Review your CV', 'Strengthen profile', 'Show your skills'], visitor, '#0ea5e9'),
        podScreenTexture('Job search', ['Matched roles', 'Applications', 'Deadlines'], visitor, '#6366f1'),
      ],
      terminal: listScreenTexture('Career assistant', ['Ask a career question', 'Find matching roles', 'Plan next steps'], '#22d3ee', 'Opens in Grooveli web', 640, 420),
      welcome: listScreenTexture('Welcome', ['AI career assistant', 'Consultation pods', 'Skills lab', 'Interview practice', 'Career pathways'], '#38bdf8', undefined, 512, 720),
      info: listScreenTexture('AI Career Center', ['Career guidance', 'CV & profile help', 'Skills & learning', 'Interview practice', 'Career pathways'], '#a78bfa', 'Rule-based assistant · no live AI', 512, 1024),
      assess: listScreenTexture('Skills assessment', skills.slice(0, 6), '#a855f7', 'Start in Grooveli web', 512, 720),
      labWall: listScreenTexture('Skill challenges', SKILL_CHALLENGES.slice(0, 5).map((c) => `${c.title} · +${c.xp} XP`), '#22d3ee', 'Public challenges · progress is tracked in Grooveli web', 1400, 560),
      labPaths: listScreenTexture('Learning pathways', ['Foundations', 'Practice', 'Certify'], '#34d399', undefined, 840, 400),
      certs: skills.slice(0, 4).map((s, i) => certTexture(s, ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b'][i]!)),
      interview: interviewScreenTexture(),
      feedback: listScreenTexture('Self-review', ['Structure', 'Clarity', 'Examples', 'Pace'], '#f97316', 'Feedback lives in Grooveli web', 640, 420),
      milestones: listScreenTexture('Milestones', ['Profile', 'Apply', 'Interview', 'Offer', 'Grow'], '#c084fc', undefined, 400, 1600),
      holoGrid: holoGridTexture(),
      holoLabels: (
        [
          ['Tech', '#22d3ee'],
          ['Health', '#f472b6'],
          ['Finance', '#fbbf24'],
          ['Creative', '#a78bfa'],
          ['Hospitality', '#fb923c'],
          ['Education', '#34d399'],
        ] as const
      ).map(([t, c]) => ({ tex: holoLabelTexture(t, c), color: c })),
      brand: aiBrandTexture(),
      screens: [screenTexture(3), screenTexture(0), screenTexture(1), screenTexture(4)],
      way: wayfindingTexture([
        ['AI core & assistant', '↑'],
        ['Consultation pods', '↑'],
        ['Skills lab · Interview', '←'],
        ['Career pathway map', '←'],
      ]),
      podSign: wayfindingTexture([['AI consultation pods', '↓']]),
    };
  }, [visitor]);
  useEffect(
    () => () => {
      for (const v of Object.values(T)) {
        const list = Array.isArray(v) ? v : [v];
        for (const t of list) (t instanceof THREE.Texture ? t : (t as { tex: THREE.Texture }).tex).dispose();
      }
    },
    [T],
  );

  const [hover, setHover] = useState<string | null>(null);
  const rig = useInteriorRig({
    camera: AI_CAMERA,
    spawn: AI_SPAWN,
    spawnHeading: PI,
    colliders: AI_COLLIDERS,
    bounds: AI_BOUNDS,
    radius: AI_PLAYER_RADIUS,
    nav: aiNavGrid,
    anchors: AI_ANCHORS,
    input,
    zoom,
    reducedMotion,
  });
  const { near, walkTo } = rig;
  const active = (id: string) => hover === id || near === id;
  useEffect(() => {
    onNearStation(near ? AI_CENTER_STATIONS.find((s) => s.id === near) ?? null : null);
  }, [near, onNearStation]);
  useEffect(() => () => onNearStation(null), [onNearStation]);

  const st = (id: string) => AI_CENTER_STATIONS.find((s) => s.id === id)!;
  const pick = (s: Station) => {
    walkTo(AI_ANCHORS[s.id]!);
    onPick(s);
  };
  const ix = { labels, labelPortal, onPick: pick, onHover: setHover };
  const items = (type: AiItem['type']) => AI_ITEMS.filter((i) => i.type === type);
  const item = (id: string) => AI_ITEMS.find((i) => i.id === id)!;
  const at = (i: AiItem, node: ReactNode) => (
    <group key={i.id} position={[i.x, 0, i.z]} rotation-y={i.rot}>
      {node}
    </group>
  );
  const tier = quality === 'low' ? 0 : quality === 'medium' ? 1 : 2;
  const W = AI_WALL_ITEMS;
  const wallX = AI.minX + AI.wallT / 2 + 0.002;
  const wallZ = AI.minZ + AI.wallT / 2 + 0.002;
  const podAccent = [m.tealFelt, m.blueGlow, m.violetGlow];

  return (
    <group>
      <PerspectiveCamera ref={rig.cam} makeDefault fov={AI_CAMERA.fov} near={0.5} far={220} position={[AI_SPAWN.x + 9, 11, AI_SPAWN.z + 9]} />
      <SceneBackground texture={daySkyTexture()} />

      {/* lighting: bright cool fill, soft key with shadows, cyan / violet / warm accents */}
      <hemisphereLight args={['#eaf4ff', '#2a3352', 1.0]} />
      <ambientLight intensity={0.22} color="#dbeafe" />
      <directionalLight
        position={[8, 15, 10]}
        intensity={1.25}
        color="#f4f8ff"
        castShadow={shadows}
        shadow-mapSize={[Math.max(512, shadowMap), Math.max(512, shadowMap)]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-far={50}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <pointLight position={[CORE.x, 2.0, CORE.z]} intensity={2.4} distance={7.5} decay={2} color="#5eead4" />
      <pointLight position={[-4.8, 2.2, 4.9]} intensity={1.3} distance={5} decay={2} color="#c4b5fd" />
      <pointLight position={[6.0, 2.4, 2.6]} intensity={1.1} distance={6} decay={2} color="#ffe2c0" />
      <pointLight position={[5.3, 2.2, -5.0]} intensity={0.9} distance={6} decay={2} color="#bae6fd" />
      <pointLight position={[-5.4, 2.3, -4.4]} intensity={0.8} distance={6} decay={2} color="#e0f2fe" />

      <StaticBatch>
        {/* ---- exterior */}
        <mesh position={[0, -0.16, 0]} rotation-x={-PI / 2} material={m.grassLawn} receiveShadow>
          <circleGeometry args={[26, 64]} />
        </mesh>
        <mesh position={[0.5, -0.09, 0.8]} material={m.pavers} receiveShadow>
          <boxGeometry args={[19.5, 0.12, 17]} />
        </mesh>
        <mesh position={[5.4, -0.02, 6.95]} material={m.navy} receiveShadow>
          <boxGeometry args={[2.3, 0.02, 0.9]} />
        </mesh>
        {[
          [-10.2, 4.0, 1.0],
          [-6.0, 8.6, 1.1],
          [10.4, 2.0, 1.1],
          [10.0, -5.5, 1.0],
        ].map(([x, z, s]) => (
          <group key={`${x}${z}`} position={[x!, -0.1, z!]}>
            <Tree m={m} s={s} />
          </group>
        ))}

        {/* ---- floor slab + zone finishes (hall last = base) */}
        <mesh position={[0, -0.06, 0]} material={m.whiteComposite} receiveShadow>
          <boxGeometry args={[AI.maxX - AI.minX + 0.2, 0.12, AI.maxZ - AI.minZ + 0.2]} />
        </mesh>
        {[...AI_ZONES].reverse().map((z, i) => (
          <ZoneFloor key={z.id} rect={z.rect} mat={floorMat(m, z.floor)} tile={FLOOR_TILE[z.floor]} y={0.001 + i * 0.0025} />
        ))}
        {/* entrance guide lines into the hall */}
        {[4.45, 6.35].map((x) => (
          <mesh key={x} position={[x, 0.006, 4.85]} material={m.softCyan}>
            <boxGeometry args={[0.04, 0.004, 3.2]} />
          </mesh>
        ))}

        {/* ---- architecture */}
        <Partitions m={arch} parts={AI_PARTITIONS} wallT={AI.wallT} />
        {/* luminous strips on the full-height walls */}
        <mesh position={[0, 0.08, wallZ + 0.01]} material={m.cyanGlow}>
          <boxGeometry args={[AI.maxX - AI.minX, 0.03, 0.02]} />
        </mesh>
        <mesh position={[0, AI.wallH - 0.35, wallZ + 0.01]} material={m.violetGlow}>
          <boxGeometry args={[AI.maxX - AI.minX, 0.025, 0.02]} />
        </mesh>
        <mesh position={[wallX + 0.01, 0.08, 0]} material={m.cyanGlow}>
          <boxGeometry args={[0.02, 0.03, AI.maxZ - AI.minZ]} />
        </mesh>
        <mesh position={[wallX + 0.01, AI.wallH - 0.35, 0]} material={m.violetGlow}>
          <boxGeometry args={[0.02, 0.025, AI.maxZ - AI.minZ]} />
        </mesh>
        {items('column').map((i) => at(i, <TechColumn m={m} h={AI.wallH} />))}
        <group position={[CORE.x, 0, CORE.z]}>
          <HaloLight m={m} r={2.25} y={3.15} top={3.6} />
        </group>

        {/* ---- wall installations */}
        <group position={[W.labAssessment.x, W.labAssessment.y, wallZ]}>
          <WallPanel m={m} t={T.labWall} w={W.labAssessment.w} h={W.labAssessment.h} frame={m.navy} />
        </group>
        <group position={[W.labPathways.x, W.labPathways.y, wallZ]}>
          <WallPanel m={m} t={T.labPaths} w={W.labPathways.w} h={W.labPathways.h} frame={m.navy} />
        </group>
        {W.certificates.map((z, i) => (
          <group key={z} position={[wallX, W.certY, z]} rotation-y={PI / 2}>
            <WallPanel m={m} t={T.certs[i]!} w={0.45} h={0.58} frame={m.brushed} />
          </group>
        ))}
        {W.acoustic.map(([a, b]) => (
          <group key={a} position={[wallX, 1.45, (a + b) / 2]} rotation-y={PI / 2}>
            <AcousticPanel m={m} w={b - a} h={2.1} />
          </group>
        ))}

        {/* ---- signage & fixtures */}
        <group position={[6.0, 0, 2.05]}>
          <HangingSign m={m} t={T.brand} w={2.0} h={0.5} y={2.55} top={3.6} />
        </group>
        <group position={[3.75, 0, 5.9]} rotation-y={PI / 4}>
          <HangingSign m={m} t={T.way} w={1.4} h={0.74} y={2.35} top={3.6} />
        </group>
        <group position={[POD_X[1]!, 0, -3.6]}>
          <HangingSign m={m} t={T.podSign} w={1.5} h={0.36} y={2.5} top={3.6} />
        </group>
        {POD_X.map((x) => (
          <group key={x} position={[x, 0, -5.6]}>
            <PendantLinear m={m} len={1.2} y={2.45} top={3.6} />
          </group>
        ))}
        {[-6.1].map((x) => (
          <group key={x} position={[x, 0, -5.5]}>
            <PendantLinear m={m} len={2.8} y={2.45} top={3.6} />
          </group>
        ))}

        {/* ---- static furniture */}
        {items('pod-chair').map((i, k) => at(i, <TaskChair m={m} fabric={k === 1 ? m.violetFabric : m.navyFabric} />))}
        {items('task-chair').map((i, k) => at(i, <TaskChair m={m} fabric={i.id === 'guide-chair' ? m.violetFabric : k % 2 ? m.tealFelt : m.navyFabric} />))}
        {items('stool').map((i) => at(i, <Stool m={m} />))}
        {at(item('collab-table'), <CollabTable m={m} />)}
        {items('meeting-chair').map((i) => at(i, <MeetingChair m={m} fabric={m.violetFabric} />))}
        {at(item('feedback-stand'), <FeedbackStand m={m} t={T.feedback} />)}
        {at(item('tripod'), <CameraTripod m={m} />)}
        {at(item('info-totem'), <InfoTotem m={m} t={T.info} />)}
        {at(item('lounge-sofa'), <Sofa m={m} length={2.0} depth={0.9} fabric={m.violetFabric} seats={3} />)}
        {at(item('lounge-table'), <CoffeeTable m={m} w={0.5} d={0.9} />)}
        {items('plant').map((i) => at(i, <Plant m={m} />))}
      </StaticBatch>

      {/* ---- animated technology (outside the batch) */}
      {items('rack').map((i) => at(i, <ServerRack m={m} v={i.v} still={reducedMotion} />))}
      {at(item('guide-robot'), <ServiceRobot m={m} still={reducedMotion} />)}
      {tier >= 1 ? AI_ROBOT_ROUTES.map((r, i) => <PatrolRobot key={i} m={m} route={r} still={reducedMotion} />) : null}

      {/* ---- stations as physical objects */}
      <Interactive station={st('assistant')} active={hover === 'assistant'} labelAt={[CORE.x, 3.0, CORE.z]} {...ix}>
        <group position={[CORE.x, 0, CORE.z]}>
          <AiCore m={m} still={reducedMotion} active={active('assistant')} />
        </group>
        {items('core-terminal').map((i) => at(i, <CoreTerminal m={m} t={T.terminal} glow={active('assistant')} />))}
      </Interactive>
      <Interactive station={st('reception')} active={hover === 'reception'} labelAt={[4.2, 1.9, 4.0]} {...ix}>
        {at(item('welcome-kiosk'), <DirectoryKiosk m={m} t={T.welcome} glow={active('reception')} brandGlow={m.cyanGlow} />)}
      </Interactive>
      {at(item('ai-desk'), <AiReceptionDesk m={m} brand={T.brand} screen={T.screens[3]!} glow={active('reception')} />)}
      {(['guidance', 'cv', 'jobs'] as const).map((id, k) => (
        <Interactive key={id} station={st(id)} active={hover === id} labelAt={[POD_X[k]!, 2.0, -5.9]} {...ix}>
          {at(item(`pod-console-${k}`), <PodConsole m={m} t={T.pods[k]!} glow={active(id)} accent={podAccent[k]!} />)}
        </Interactive>
      ))}
      <Interactive station={st('learning')} active={hover === 'learning'} labelAt={[-6.1, 1.6, -5.95]} {...ix}>
        {items('lab-desk').map((i, k) => at(i, <Desk m={m} w={1.3} d={0.6} v={k === 0 ? 0 : 3} screens={T.screens} glow={active('learning')} />))}
      </Interactive>
      <Interactive station={st('assessment')} active={hover === 'assessment'} labelAt={[-3.4, 1.95, -5.95]} {...ix}>
        {at(item('assess-kiosk'), <DirectoryKiosk m={m} t={T.assess} glow={active('assessment')} brandGlow={m.violetGlow} />)}
      </Interactive>
      <Interactive station={st('matching')} active={hover === 'matching'} labelAt={[0, 3.0, -6.2]} {...ix}>
        <group position={[W.intelligenceWall.x, W.intelligenceWall.y, wallZ]}>
          <IntelligenceWall m={m} t={T.intel} w={W.intelligenceWall.w} h={W.intelligenceWall.h} glow={active('matching')} still={reducedMotion} />
        </group>
      </Interactive>
      <Interactive station={st('interview')} active={hover === 'interview'} labelAt={[-6.4, 2.3, 0.6]} {...ix}>
        <group position={[wallX, W.interviewDisplay.y, W.interviewDisplay.z]} rotation-y={PI / 2}>
          <WallPanel m={m} t={T.interview} w={W.interviewDisplay.w} h={W.interviewDisplay.h} glow={active('interview')} frame={m.navy} />
        </group>
        {at(item('int-desk'), <InterviewDesk m={m} w={1.3} d={0.7} />)}
      </Interactive>
      <Interactive station={st('pathway')} active={hover === 'pathway'} labelAt={[-4.8, 2.4, 4.9]} {...ix}>
        {at(item('holo-table'), <HoloTable m={m} grid={T.holoGrid} labels={T.holoLabels} still={reducedMotion} glow={active('pathway')} />)}
        {at(item('milestone-totem'), <SlimTotem m={m} t={T.milestones} glow={active('pathway')} />)}
      </Interactive>

      {/* contextual indicator at the nearest / hovered station */}
      {Object.entries(AI_ANCHORS)
        .filter(([id]) => active(id))
        .map(([id, a]) => (
          <mesh key={id} position={[a.x, 0.015, a.z]} rotation-x={-PI / 2}>
            <ringGeometry args={[0.32, 0.42, 36]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} toneMapped={false} />
          </mesh>
        ))}

      {/* walkable floor: click to route there */}
      <mesh
        position={[0, 0.004, 0]}
        rotation-x={-PI / 2}
        visible={false}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          walkTo({ x: e.point.x, z: e.point.z });
        }}
      >
        <planeGeometry args={[AI.maxX - AI.minX, AI.maxZ - AI.minZ]} />
      </mesh>

      {/* simulated visitors and staff (labelled as simulated in the HUD) */}
      <group ref={rig.crowd}>
        {AI_STAFF.filter((s) => s.tier <= tier).map((s) => (
          <StaffMember key={s.id} spec={s} index={AI_STAFF.indexOf(s) + 3} reducedMotion={reducedMotion} />
        ))}
      </group>

      <group ref={rig.body}>
        <Avatar avatar={avatar} motion={rig.motion} still={reducedMotion} />
        <mesh position-y={0.012} rotation-x={-PI / 2}>
          <circleGeometry args={[0.3, 24]} />
          <meshBasicMaterial color="#0b1222" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </group>

      <ContactShadows position={[0, 0.008, 0]} scale={[AI.maxX - AI.minX + 1, AI.maxZ - AI.minZ + 1]} resolution={1024} blur={2.4} far={2.2} opacity={0.42} frames={1} color="#0b1222" />
    </group>
  );
}
