import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { HIDDEN_SCENE, SceneActive, inHiddenScene } from './sceneActive';
import type { LabelPortal } from './labels';
import type { AvatarConfig, DistrictId, PresenceProjection, PublicHqProjection } from '@grooveli/frontend-domain/public';
import { Environment } from './Environment';
import { Ambient } from './Ambient';
import { Player, type InputState, type PlayerState } from './Player';
import { PresenceAvatars } from './Presence';
import { Interior } from './Interior';
import { HqPreloader } from './hq/HqPreloader';
import { DEMO_HQ } from './hq/HqOffice';
import { markHqWarm } from './hq/hqResources';
import { Sun } from './Sun';
import { CAMERA, CAMERA_OFFSET, type CityView } from './camera';
import type { Quality } from '../world/ambient';
import type { CityFeatureId, PlacedBuilding, Vec2 } from '../world/layout';
import type { InteriorKind, Station } from '../app/interiors';
import type { AiVisitor } from './ai/aiTextures';
import type { BoardModel } from '../services/markets';

export interface CityCanvasProps {
  avatar: AvatarConfig;
  quality: Quality;
  night: boolean;
  labels: boolean;
  reducedMotion: boolean;
  zoom: number;
  player: MutableRefObject<PlayerState>;
  input: MutableRefObject<InputState>;
  people: PresenceProjection[];
  eventDistricts: DistrictId[];
  currentDistrict: DistrictId | null;
  nearbyId: string | null;
  topJobs: { title: string; count: number }[];
  interior: { kind: InteriorKind; brand?: { color: string; name: string }; hq?: PublicHqProjection | null } | null;
  onMoved: (p: Vec2) => void;
  onGround: (p: Vec2) => void;
  onBuilding: (b: PlacedBuilding) => void;
  onStation: (s: Station) => void;
  onNearStation: (s: Station | null) => void;
  onContextLost: () => void;
  visitor?: AiVisitor;
  view: MutableRefObject<CityView>;
  cameraAssist: boolean;
  onAssist?: (entrance: string | null) => void;
  /** Stop rendering while a full-screen overlay (the full city map) covers the scene. */
  paused?: boolean;
  featurePulse: number;
  onFeature: (id: CityFeatureId) => void;
  markets: BoardModel | null;
  /** Fired once each time a scene (street or interior) has rendered its first complete frame. */
  onSceneReady?: () => void;
  /** Company HQ to prepare in the background (null hq = demonstration HQ). */
  preload?: { key: string; hq: PublicHqProjection | null } | null;
}

/**
 * Reports when the scene it is mounted in has been fully drawn once. useFrame
 * callbacks run before each render, so the second callback means the first
 * frame (with its geometry uploads and shader compiles) has completed.
 */
function SceneReady({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 2) onReady?.();
  });
  return null;
}

/** A visited HQ has compiled its shaders: background preparation can skip it afterwards. */
function MarkHqWarm({ hq }: { hq: PublicHqProjection }) {
  useEffect(() => markHqWarm(hq), [hq]);
  return null;
}

/** Objects inside a mounted-but-hidden scene (see sceneActive.ts) never receive pointer events. */
function HiddenScenesIgnorePointer() {
  const setEvents = useThree((s) => s.setEvents);
  useEffect(() => {
    setEvents({ filter: (hits) => hits.filter((h) => !inHiddenScene(h.object)) });
  }, [setEvents]);
  return null;
}

/** Dev-only render statistics for performance checks (window.__grooveliRender). */
function RenderStats({ player, view }: { player: MutableRefObject<PlayerState>; view: MutableRefObject<CityView> }) {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    const w = window as unknown as { __grooveliRender?: unknown; __grooveliPlayer?: unknown; __grooveliGl?: unknown };
    w.__grooveliGl = gl;
    w.__grooveliRender = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    w.__grooveliPlayer = { x: player.current.pos.x, z: player.current.pos.z, yaw: view.current.yaw };
  });
  return null;
}

export default function CityCanvas(props: CityCanvasProps) {
  const { night, quality, interior } = props;
  // Walkable interiors bring their own camera, sky and light rig.
  const ownRig = !!interior;
  const labelLayer = useRef<HTMLDivElement>(null) as unknown as LabelPortal;
  const focus = useRef<Vec2>({ x: props.player.current.pos.x, z: props.player.current.pos.z + CAMERA.leadZ });
  return (
    <div className="canvas-stack">
      <div ref={labelLayer as unknown as React.RefObject<HTMLDivElement>} className="label-layer" aria-hidden="true" />
      <Canvas
        frameloop={props.paused ? 'never' : 'always'}
        dpr={quality.dpr}
        shadows={quality.shadows ? 'soft' : false}
        gl={{ antialias: quality.level !== 'low', powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            props.onContextLost();
          });
        }}
        aria-hidden="true"
      >
        {import.meta.env.DEV ? <RenderStats player={props.player} view={props.view} /> : null}
        {ownRig ? null : <color attach="background" args={[night ? '#070d1f' : '#cfe6f5']} />}
        <OrthographicCamera
          makeDefault
          position={[focus.current.x, CAMERA_OFFSET.y, focus.current.z + CAMERA_OFFSET.z]}
          zoom={CAMERA.baseZoom}
          near={-300}
          far={800}
        />
        {ownRig ? null : (
          <>
            <hemisphereLight args={[night ? '#8090cc' : '#e3f2ff', night ? '#3a3346' : '#a3a48e', night ? 1.35 : 1.25]} />
            <ambientLight intensity={night ? 0.3 : 0.25} color={night ? '#c7d2fe' : '#ffffff'} />
          </>
        )}
        <HiddenScenesIgnorePointer />
        {/* The street stays mounted (hidden and frozen) while you are inside, so leaving is instant. */}
        <SceneActive.Provider value={!interior}>
          <group visible={!interior} userData={{ [HIDDEN_SCENE]: !!interior }}>
            <Sun focus={focus} night={night} shadows={quality.shadows} mapSize={quality.shadowMap} />
            <Environment
              night={night}
              labels={props.labels && !interior}
              density={quality.props}
              eventDistricts={props.eventDistricts}
              reducedMotion={props.reducedMotion}
              currentDistrict={props.currentDistrict}
              nearbyId={props.nearbyId}
              topJobs={props.topJobs}
              onGround={props.onGround}
              onBuilding={props.onBuilding}
              labelPortal={labelLayer}
              focus={focus}
              nightLights={quality.level === 'high' ? 6 : quality.level === 'medium' ? 4 : 0}
              featurePulse={props.featurePulse}
              onFeature={props.onFeature}
              markets={props.markets}
            />
            <Ambient pedestrians={quality.pedestrians} vehicles={quality.vehicles} reducedMotion={props.reducedMotion} night={night} />
            <PresenceAvatars people={props.people} labels={props.labels && !interior} labelPortal={labelLayer} player={props.player} />
            <Player
              avatar={props.avatar}
              player={props.player}
              input={props.input}
              focus={focus}
              zoom={props.zoom}
              reducedMotion={props.reducedMotion}
              view={props.view}
              assist={props.cameraAssist}
              onMoved={props.onMoved}
              onAssist={props.onAssist}
            />
          </group>
        </SceneActive.Provider>
        {interior ? (
          <>
            <SceneReady key={`interior-${interior.kind}`} onReady={props.onSceneReady} />
            {interior.kind === 'hq' ? <MarkHqWarm hq={interior.hq ?? DEMO_HQ} /> : null}
            <Interior
              kind={interior.kind}
              avatar={props.avatar}
              brand={interior.brand}
              labels={props.labels}
              onPick={props.onStation}
              labelPortal={labelLayer}
              input={props.input}
              reducedMotion={props.reducedMotion}
              shadows={quality.shadows}
              onNearStation={props.onNearStation}
              hq={interior.hq}
              zoom={props.zoom}
              quality={quality.level}
              shadowMap={quality.shadowMap}
              visitor={props.visitor}
            />
          </>
        ) : (
          <>
            <SceneReady key="street" onReady={props.onSceneReady} />
            {props.preload ? <HqPreloader key={props.preload.key} hq={props.preload.hq ?? DEMO_HQ} shadows={quality.shadows} shadowMap={quality.shadowMap} /> : null}
          </>
        )}
      </Canvas>
    </div>
  );
}
