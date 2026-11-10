import { describe, expect, it } from 'vitest';
import { ENTRANCE_VIEWS, NO_ASSIST, entranceVisible, manualOverride, playerOccluded, stepAssist } from '../src/world/cameraAssist';
import { inputToWorld } from '../src/world/movement';
import { PLACED_BUILDINGS } from '../src/world/layout';

const north = ENTRANCE_VIEWS.find((e) => e.buildingId === 'b-apartment')!;
const south = ENTRANCE_VIEWS.find((e) => e.buildingId === 'b-kestrel')!;
const at = (e: { x: number; z: number; normal: { x: number; z: number } }, out: number) => ({ x: e.x + e.normal.x * out, z: e.z + e.normal.z * out });

describe('entrance camera assist', () => {
  it('describes every enterable entrance with a facing and preferred view', () => {
    expect(ENTRANCE_VIEWS.length).toBe(PLACED_BUILDINGS.filter((b) => b.entrance).length);
    for (const e of ENTRANCE_VIEWS) {
      expect(Math.hypot(e.normal.x, e.normal.z)).toBeCloseTo(1);
      expect(e.release).toBeGreaterThan(e.activate);
      expect(e.activate).toBeGreaterThan(e.radius);
    }
    expect(north.preferredYaw).toBeCloseTo(Math.PI);
    expect(south.preferredYaw).toBeCloseTo(0);
  });

  it('treats north-facing doors as hidden from the default north view and visible from the far side', () => {
    const p = at(north, 1.5);
    expect(entranceVisible(north, p, 0)).toBe(false);
    expect(playerOccluded(p, 0)).toBe(true); // the building sits between the player and the camera
    expect(entranceVisible(north, p, Math.PI)).toBe(true);
    expect(entranceVisible(south, at(south, 1.5), 0)).toBe(true);
  });

  it('turns once on approach, holds without oscillating, and releases on leaving', () => {
    let s = stepAssist(NO_ASSIST, at(north, 12), 0, true);
    expect(s.active).toBeNull();
    s = stepAssist(s, at(north, 5), 0, true);
    expect(s.active).toBe(north.id);
    // inside the release radius the view holds even though the door is now visible
    for (const d of [3, 1, 6, 9]) {
      const again = stepAssist(s, at(north, d), Math.PI, true);
      expect(again).toBe(s);
    }
    s = stepAssist(s, at(north, 11), Math.PI, true);
    expect(s.active).toBeNull();
  });

  it('never turns for doors the current view already shows', () => {
    expect(stepAssist(NO_ASSIST, at(south, 2), 0, true).active).toBeNull();
  });

  it('respects manual camera control and the setting', () => {
    let s = stepAssist(NO_ASSIST, at(north, 4), 0, true);
    s = manualOverride(s);
    expect(s).toEqual({ active: null, suppressed: north.id });
    expect(stepAssist(s, at(north, 3), 0, true).active).toBeNull(); // no immediate re-turn
    s = stepAssist(s, at(north, 12), 0, true); // walked away: suppression cleared
    expect(s.suppressed).toBeNull();
    expect(stepAssist(NO_ASSIST, at(north, 4), 0, false).active).toBeNull();
    const on = stepAssist(NO_ASSIST, at(north, 4), 0, true);
    expect(stepAssist(on, at(north, 4), Math.PI, false).active).toBeNull();
  });

  it('keeps movement screen-relative when the view is turned', () => {
    const up0 = inputToWorld({ x: 0, y: 1 }, 0);
    expect(up0.x).toBeCloseTo(0);
    expect(up0.z).toBeCloseTo(-1);
    const upPi = inputToWorld({ x: 0, y: 1 }, Math.PI);
    expect(upPi.x).toBeCloseTo(0);
    expect(upPi.z).toBeCloseTo(1);
    const rightPi = inputToWorld({ x: 1, y: 0 }, Math.PI);
    expect(rightPi.x).toBeCloseTo(-1);
  });
});
