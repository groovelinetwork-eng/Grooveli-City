import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { InputState } from '../Player';
import { CAMERA } from '../camera';
import { findPath, type NavGrid } from '../../world/nav';
import { inputToRoom, step } from '../../world/movement';
import type { AABB, Vec2 } from '../../world/layout';

/** Camera framing for a walkable interior (perspective, three-quarter cutaway). */
export interface InteriorCameraConfig {
  fov: number;
  yawDeg: number;
  pitchDeg: number;
  /** Distance at the default zoom. */
  distance: number;
  minDistance: number;
  maxDistance: number;
  refAspect: number;
  /** Offset from the player into the building (the camera sits outside the open +X/+Z corner). */
  lead: Vec2;
  /** Where the view target may go (keeps the building framed). */
  targetBounds: AABB;
  /** Look-at height. */
  lookY?: number;
}

export interface InteriorRigOptions {
  camera: InteriorCameraConfig;
  spawn: Vec2;
  spawnHeading: number;
  colliders: AABB[];
  bounds: AABB;
  radius: number;
  nav: () => NavGrid;
  anchors: Record<string, Vec2>;
  input: MutableRefObject<InputState>;
  zoom: number;
  reducedMotion: boolean;
  walkSpeed?: number;
  stationRadius?: number;
}

const PI = Math.PI;

/**
 * Player + camera rig shared by walkable interiors: keyboard/joystick walking
 * relative to the camera, A* click-to-walk, collision, nearest-station
 * detection (React state only changes when the nearest station changes),
 * follow camera with zoom (+/−, wheel) and grab-to-pan. People are hidden for
 * the first frames so the one-shot contact-shadow bake only captures furniture.
 */
export function useInteriorRig(o: InteriorRigOptions) {
  const cam = useRef<THREE.PerspectiveCamera>(null);
  const body = useRef<THREE.Group>(null);
  const crowd = useRef<THREE.Group>(null);
  const motion = useRef(0);
  const frames = useRef(0);
  const state = useRef<{ pos: Vec2; path: Vec2[]; heading: number }>({ pos: { ...o.spawn }, path: [], heading: o.spawnHeading });
  const pan = useRef<Vec2>({ x: 0, z: 0 });
  const wheel = useRef(1);
  const c = o.camera;
  const view = useRef({ x: o.spawn.x + c.lead.x, z: o.spawn.z + c.lead.z, d: c.distance });
  const [near, setNear] = useState<string | null>(null);
  const nearRef = useRef<string | null>(null);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const yaw = (c.yawDeg * PI) / 180;
  const pitch = (c.pitchDeg * PI) / 180;
  const lookY = c.lookY ?? 0.6;

  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    let dragging = false;
    const onWheel = (e: WheelEvent) => {
      wheel.current = Math.min(2.4, Math.max(0.45, wheel.current * Math.exp(e.deltaY * 0.0012)));
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) {
        down = { x: e.clientX, y: e.clientY };
        dragging = false;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!down || !(e.buttons & 1)) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!dragging && Math.hypot(dx, dy) < 6) return;
      dragging = true;
      down = { x: e.clientX, y: e.clientY };
      const k = (view.current.d * 0.62) / Math.max(1, el.clientHeight);
      // Grab-and-drag: the view moves opposite to the pointer. On the floor,
      // screen-right R = (cos yaw, −sin yaw) and screen-up F = (−sin yaw, −cos yaw);
      // vertical pixels cover more floor (×1.45) because the view is pitched.
      pan.current.x += (-Math.cos(yaw) * dx - Math.sin(yaw) * dy * 1.45) * k;
      pan.current.z += (Math.sin(yaw) * dx - Math.cos(yaw) * dy * 1.45) * k;
      pan.current.x = Math.max(-10, Math.min(10, pan.current.x));
      pan.current.z = Math.max(-9, Math.min(9, pan.current.z));
    };
    const onUp = () => {
      down = null;
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, yaw]);

  const walkTo = (p: Vec2) => {
    state.current.path = findPath(o.nav(), state.current.pos, p) ?? [];
  };

  useFrame((_, dt) => {
    // ---- player
    const p = state.current;
    const manual = inputToRoom(o.input.current);
    const moving = Math.hypot(manual.x, manual.z) > 0.05;
    if (moving) p.path = [];
    let dir: Vec2 = manual;
    if (!moving && p.path.length) {
      const wp = p.path[0]!;
      const d = Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z);
      if (d < 0.12) {
        p.path.shift();
        dir = { x: 0, z: 0 };
      } else dir = { x: (wp.x - p.pos.x) / d, z: (wp.z - p.pos.z) / d };
    }
    let walking = false;
    if (dir.x !== 0 || dir.z !== 0) {
      const next = step(p.pos, dir, dt, o.colliders, o.walkSpeed ?? 2.8, o.bounds, o.radius);
      const moved = Math.hypot(next.x - p.pos.x, next.z - p.pos.z);
      if (!moving && moved < 1e-4) p.path = [];
      walking = moved > 1e-4;
      p.pos = next;
      const want = Math.atan2(dir.x, dir.z);
      const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
      p.heading += o.reducedMotion ? diff : diff * Math.min(1, dt * 12);
    }
    motion.current = walking ? 1 : 0;
    if (walking) {
      pan.current.x *= 0.9;
      pan.current.z *= 0.9;
    }
    frames.current++;
    const ready = frames.current > 3;
    if (body.current) {
      body.current.visible = ready;
      body.current.position.set(p.pos.x, 0, p.pos.z);
      body.current.rotation.y = p.heading;
    }
    if (crowd.current) crowd.current.visible = ready;
    let best: string | null = null;
    let bestD = o.stationRadius ?? 1.35;
    for (const [id, a] of Object.entries(o.anchors)) {
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      if (d < bestD) {
        best = id;
        bestD = d;
      }
    }
    if (best !== nearRef.current) {
      nearRef.current = best;
      setNear(best);
    }

    // ---- camera
    const camera = cam.current;
    if (!camera) return;
    const aspect = size.width / Math.max(1, size.height);
    const fit = Math.min(2.2, Math.max(1, c.refAspect / aspect));
    const want = Math.min(c.maxDistance, Math.max(c.minDistance, c.distance * (CAMERA.baseZoom / o.zoom) * wheel.current * fit));
    const k = o.reducedMotion ? 1 : 1 - Math.pow(0.002, Math.min(dt, 0.1));
    const v = view.current;
    const tb = c.targetBounds;
    const tx = Math.max(tb.minX, Math.min(tb.maxX, p.pos.x + c.lead.x + pan.current.x));
    const tz = Math.max(tb.minZ, Math.min(tb.maxZ, p.pos.z + c.lead.z + pan.current.z));
    v.x += (tx - v.x) * k;
    v.z += (tz - v.z) * k;
    v.d += (want - v.d) * k;
    camera.position.set(v.x + Math.cos(pitch) * Math.sin(yaw) * v.d, lookY + Math.sin(pitch) * v.d, v.z + Math.cos(pitch) * Math.cos(yaw) * v.d);
    camera.lookAt(v.x, lookY, v.z);
  });

  return { cam, body, crowd, motion, near, walkTo, state };
}
