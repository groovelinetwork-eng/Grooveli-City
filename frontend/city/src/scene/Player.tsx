import { useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, OrthographicCamera } from 'three';
import type { AvatarConfig } from '@grooveli/frontend-domain/public';
import { Avatar } from './Avatar';
import { PERSON_SCALE } from './Ambient';
import { CAMERA, CAMERA_OFFSET, effectiveZoom, type CityView } from './camera';
import { inputToWorld, seek, step } from '../world/movement';
import { groundHeight, type Vec2 } from '../world/layout';
import { NO_ASSIST, activeEntrance, angleDelta, manualOverride, stepAssist, type AssistState } from '../world/cameraAssist';

export interface PlayerState {
  pos: Vec2;
  target: Vec2 | null;
  heading: number;
}

export interface InputState {
  /** Screen-space axes, -1..1 (keyboard or joystick). */
  x: number;
  y: number;
}

const QUARTER = Math.PI / 2;

/**
 * Moves the avatar from input, resolves collisions, and drives the city's
 * orthographic follow camera. The camera normally looks north; it turns
 * smoothly toward an entrance the current view cannot see (see
 * world/cameraAssist.ts) and supports manual quarter turns, which always win
 * over the assist until the player walks away from that entrance.
 */
export function Player({
  avatar,
  player,
  input,
  focus,
  zoom,
  reducedMotion,
  view,
  assist: assistEnabled,
  onMoved,
  onAssist,
}: {
  avatar: AvatarConfig;
  player: MutableRefObject<PlayerState>;
  input: MutableRefObject<InputState>;
  /** Camera look-at point, shared with the sun so shadows follow the view. */
  focus: MutableRefObject<Vec2>;
  zoom: number;
  reducedMotion: boolean;
  view: MutableRefObject<CityView>;
  /** Entrance camera assistance enabled (setting). */
  assist: boolean;
  onMoved: (p: Vec2) => void;
  /** Called when the assisted entrance changes (name, or null when released). */
  onAssist?: (entrance: string | null) => void;
}) {
  const ref = useRef<Group>(null);
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const width = useThree((s) => s.size.width);
  const lastReport = useRef(0);
  const y = useRef(groundHeight(player.current.pos));
  const motion = useRef(0);
  const assist = useRef<AssistState>(NO_ASSIST);
  /** The player's own view yaw (manual turns); the assist overrides it temporarily. */
  const baseYaw = useRef(0);

  useFrame((state, dt) => {
    const p = player.current;
    const v = view.current;

    // ---- manual view control (queued by the HUD / keyboard)
    if (v.turn || v.reset) {
      const from = Math.round(v.yaw / QUARTER) * QUARTER;
      baseYaw.current = v.reset ? 0 : from + v.turn * QUARTER;
      v.turn = 0;
      v.reset = false;
      const before = assist.current;
      assist.current = manualOverride(assist.current);
      if (before.active && onAssist) onAssist(null);
    }

    // ---- movement (screen-relative to the current camera yaw)
    const manual = inputToWorld(input.current, v.yaw);
    const moving = Math.hypot(manual.x, manual.z) > 0.05;
    if (moving) p.target = null;
    const dir = moving ? manual : seek(p.pos, p.target);
    motion.current = 0;
    if (dir.x !== 0 || dir.z !== 0) {
      const next = step(p.pos, dir, dt);
      // Stop seeking if blocked by a collider.
      if (p.target && Math.hypot(next.x - p.pos.x, next.z - p.pos.z) < 1e-4) p.target = null;
      motion.current = Math.hypot(next.x - p.pos.x, next.z - p.pos.z) > 1e-4 ? 1 : 0;
      p.pos = next;
      p.heading = Math.atan2(dir.x, dir.z);
    }
    // Step smoothly up onto kerbs and the raised plaza.
    const gy = groundHeight(p.pos);
    y.current += (gy - y.current) * Math.min(1, dt * 14);
    if (ref.current) {
      ref.current.position.set(p.pos.x, y.current, p.pos.z);
      ref.current.rotation.y = p.heading;
    }

    // ---- entrance assistance (hysteresis lives in stepAssist)
    const prev = assist.current;
    const next = stepAssist(prev, p.pos, baseYaw.current, assistEnabled);
    if (next !== prev) {
      assist.current = next;
      if (next.active !== prev.active) onAssist?.(activeEntrance(next)?.name ?? null);
    }
    const target = activeEntrance(assist.current)?.preferredYaw ?? baseYaw.current;
    // Eased turn (~1 s); instant with reduced motion.
    const ky = reducedMotion ? 1 : 1 - Math.pow(0.03, Math.min(dt, 0.1));
    v.yaw += angleDelta(v.yaw, target) * ky;
    if (Math.abs(angleDelta(v.yaw, target)) < 1e-3) v.yaw = target;

    // ---- camera follow: eased normally, snapped when reduced motion is on
    const k = reducedMotion ? 1 : 1 - Math.pow(0.001, dt);
    const s = Math.sin(v.yaw);
    const c = Math.cos(v.yaw);
    // Lead the view "up the screen" (north at yaw 0), rotated with the camera.
    const lead = -CAMERA.leadZ;
    const f = focus.current;
    f.x += (p.pos.x - s * lead - f.x) * k;
    f.z += (p.pos.z - c * lead - f.z) * k;
    camera.position.set(f.x + s * CAMERA_OFFSET.z, CAMERA_OFFSET.y, f.z + c * CAMERA_OFFSET.z);
    camera.lookAt(f.x, 0, f.z);
    const z = effectiveZoom(zoom, width);
    if (camera.zoom !== z) {
      camera.zoom = z;
      camera.updateProjectionMatrix();
    }
    if (state.clock.elapsedTime - lastReport.current > 0.2) {
      lastReport.current = state.clock.elapsedTime;
      onMoved(p.pos);
    }
  });

  return <Avatar ref={ref} avatar={avatar} highlight scale={PERSON_SCALE} motion={motion} still={reducedMotion} />;
}
