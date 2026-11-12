import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
// jsdom has no WebGL: replace the R3F canvas with a stub so the DOM HUD can be tested.
vi.mock('../src/scene/CityCanvas', async () => ({ default: (await import('./canvasStub')).CanvasStub }));

import { App } from '../src/app/App';
import { decideTouchControls, touchLayout } from '../src/app/touchControls';
import { loadSettings } from '../src/app/settings';
import { TouchControls, joystickVector } from '../src/ui/TouchControls';
import { createCityView, type CityView } from '../src/scene/camera';
import type { InputState } from '../src/scene/Player';

// jsdom lacks PointerEvent; a MouseEvent subclass carries clientX/Y and pointerId like browsers do.
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class PE extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'touch';
      }
    }
    (window as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
  }
});

const desktop = { primaryCoarse: false, anyTouch: false };
const phone = { primaryCoarse: true, anyTouch: true };
const touchLaptop = { primaryCoarse: false, anyTouch: true };

describe('touch control detection (capabilities, not user agent)', () => {
  it('shows on phones/tablets, never on ordinary desktops, and on touch laptops only after a touch', () => {
    expect(decideTouchControls('auto', phone, null)).toBe(true);
    expect(decideTouchControls('auto', desktop, null)).toBe(false);
    expect(decideTouchControls('auto', desktop, 'touch')).toBe(false);
    expect(decideTouchControls('auto', touchLaptop, null)).toBe(false);
    expect(decideTouchControls('auto', touchLaptop, 'touch')).toBe(true);
    expect(decideTouchControls('auto', touchLaptop, 'keyboard')).toBe(false);
    expect(decideTouchControls('auto', touchLaptop, 'mouse')).toBe(false);
    expect(decideTouchControls('on', desktop, null)).toBe(true);
    expect(decideTouchControls('off', phone, 'touch')).toBe(false);
  });

  it('picks the layout from the short side in both orientations', () => {
    expect(touchLayout(390, 844)).toBe('phone');
    expect(touchLayout(844, 390)).toBe('phone');
    expect(touchLayout(768, 1024)).toBe('tablet');
    expect(touchLayout(1180, 820)).toBe('tablet');
  });

  it('migrates the old joystick setting', () => {
    localStorage.setItem('grooveli.city-settings.v1', JSON.stringify({ joystick: true }));
    expect(loadSettings().touchControls).toBe('on');
    localStorage.setItem('grooveli.city-settings.v1', JSON.stringify({ joystick: false }));
    expect(loadSettings().touchControls).toBe('auto');
    localStorage.setItem('grooveli.city-settings.v1', JSON.stringify({ touchControls: 'off', joystick: true }));
    expect(loadSettings().touchControls).toBe('off');
    localStorage.removeItem('grooveli.city-settings.v1');
  });
});

describe('joystick', () => {
  it('ignores a resting thumb, clamps at the rim and maps screen-up to forward', () => {
    expect(joystickVector(0.05, -0.05)).toEqual({ x: 0, y: 0 });
    const up = joystickVector(0, -1);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(1);
    const far = joystickVector(3, 0);
    expect(far.x).toBeCloseTo(1);
    const diag = joystickVector(0.5, 0.5);
    expect(Math.hypot(diag.x, diag.y)).toBeLessThan(1);
    expect(diag.y).toBeLessThan(0);
  });
});

function setup(interactLabel: string | null = null) {
  const input = { current: { x: 0, y: 0 } } as MutableRefObject<InputState>;
  const view = { current: createCityView() } as MutableRefObject<CityView>;
  const onInteract = vi.fn();
  const onZoom = vi.fn();
  render(
    <TouchControls input={input} view={view} layout="phone" orientation="portrait" canRotate canZoom interactLabel={interactLabel} onInteract={onInteract} onZoom={onZoom} />,
  );
  return { input, view, onInteract, onZoom };
}

describe('touch controls', () => {
  afterEach(() => vi.restoreAllMocks());

  it('drives movement from the joystick and returns to neutral when cancelled', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const { input } = setup();
    const joy = screen.getByRole('application', { name: /Movement joystick/ });
    fireEvent.pointerDown(joy, { pointerId: 7, clientX: 100, clientY: 50 });
    expect(input.current.x).toBeGreaterThan(0.9);
    fireEvent.pointerMove(joy, { pointerId: 7, clientX: 50, clientY: 0 });
    expect(input.current.y).toBeGreaterThan(0.9);
    fireEvent.pointerCancel(joy, { pointerId: 7 });
    expect(input.current).toEqual({ x: 0, y: 0 });
  });

  it('rotates the camera only while a rotate button is held', () => {
    const { view } = setup();
    const left = screen.getByRole('button', { name: /Rotate camera left/ });
    const right = screen.getByRole('button', { name: /Rotate camera right/ });
    fireEvent.pointerDown(left, { pointerId: 1 });
    expect(view.current.spin).toBe(-1);
    fireEvent.pointerUp(left, { pointerId: 1 });
    expect(view.current.spin).toBe(0);
    fireEvent.pointerDown(right, { pointerId: 2 });
    expect(view.current.spin).toBe(1);
    fireEvent.pointerCancel(right, { pointerId: 2 });
    expect(view.current.spin).toBe(0);
    fireEvent.keyDown(left, { key: 'Enter' });
    expect(view.current.turn).toBe(-1);
  });

  it('shows Interact only when something is nearby and zooms both ways', () => {
    const a = setup(null);
    expect(screen.queryByRole('button', { name: /Interact with/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(a.onZoom.mock.calls).toEqual([[1], [-1]]);
  });

  it('calls the interaction handler for the nearby object', () => {
    const { onInteract } = setup('Grooveli Plaza');
    fireEvent.click(screen.getByRole('button', { name: 'Interact with Grooveli Plaza' }));
    expect(onInteract).toHaveBeenCalledTimes(1);
  });
});

describe('touch controls in the app', () => {
  it('stays hidden on an ordinary desktop and appears when forced on', async () => {
    localStorage.setItem('grooveli.city-settings.v1', JSON.stringify({ touchControls: 'auto' }));
    const { unmount } = render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    expect(screen.queryByTestId('touch-controls')).toBeNull();
    unmount();
    localStorage.setItem('grooveli.city-settings.v1', JSON.stringify({ touchControls: 'on' }));
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    expect(screen.getByTestId('touch-controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rotate camera left/ })).toBeInTheDocument();
    // nothing reported nearby yet (stub canvas) → the contextual Interact button stays hidden
    expect(screen.queryByRole('button', { name: /Interact with/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    localStorage.removeItem('grooveli.city-settings.v1');
  });
});

