import { useEffect, useRef, type KeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { InputState } from '../scene/Player';
import type { CityView } from '../scene/camera';

/** Fraction of the joystick radius ignored around the centre (no drift from a resting thumb). */
const DEAD_ZONE = 0.12;

/** Maps a pointer offset (in joystick radii) to movement input: dead zone, clamp, rescale. */
export function joystickVector(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len <= DEAD_ZONE) return { x: 0, y: 0 };
  const mag = (Math.min(1, len) - DEAD_ZONE) / (1 - DEAD_ZONE);
  return { x: (dx / len) * mag, y: (-dy / len) * mag };
}

/** Touch joystick writing screen-space axes into the shared input ref (360°, returns to neutral on release/cancel). */
export function Joystick({ input }: { input: MutableRefObject<InputState> }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const update = (e: ReactPointerEvent) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rad = r.width / 2;
    const dx = (e.clientX - (r.left + rad)) / rad;
    const dy = (e.clientY - (r.top + rad)) / rad;
    input.current = joystickVector(dx, dy);
    const len = Math.hypot(dx, dy);
    const k = len > 1 ? 1 / len : 1;
    if (knob.current) knob.current.style.transform = `translate(${dx * k * rad * 0.55}px, ${dy * k * rad * 0.55}px)`;
  };
  const end = () => {
    active.current = null;
    input.current = { x: 0, y: 0 };
    if (knob.current) knob.current.style.transform = '';
    base.current?.classList.remove('is-active');
  };
  useEffect(() => {
    const stop = () => {
      if (active.current !== null) end();
    };
    const onVis = () => document.hidden && stop();
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label="Movement joystick. Drag to walk."
      onPointerDown={(e) => {
        if (active.current !== null) return;
        e.preventDefault();
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.classList.add('is-active');
        update(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && update(e)}
      onPointerUp={(e) => active.current === e.pointerId && end()}
      onPointerCancel={(e) => active.current === e.pointerId && end()}
      onLostPointerCapture={(e) => active.current === e.pointerId && end()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={knob} className="joystick-knob" />
    </div>
  );
}

/** Press-and-hold camera rotation: spins while held, stops on release/cancel; keyboard Enter/Space = quarter turn. */
function RotateButton({ view, dir, label, children }: { view: MutableRefObject<CityView>; dir: 1 | -1; label: string; children: ReactNode }) {
  const pointer = useRef<number | null>(null);
  const stop = () => {
    pointer.current = null;
    if (view.current.spin === dir) view.current.spin = 0;
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      className="touch-btn touch-rotate"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        view.current.spin = dir;
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onBlur={stop}
      onKeyDown={(e: KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          view.current.turn += dir;
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export interface TouchControlsProps {
  input: MutableRefObject<InputState>;
  view: MutableRefObject<CityView>;
  layout: 'phone' | 'tablet';
  orientation: 'portrait' | 'landscape';
  /** City camera can rotate (not inside fixed-camera interiors). */
  canRotate: boolean;
  canZoom: boolean;
  /** Name of the nearby interactive object, or null. */
  interactLabel: string | null;
  onInteract: () => void;
  onZoom: (dir: 1 | -1) => void;
}

/** Mobile / tablet control layer: joystick (left), camera + interaction cluster (right). */
export function TouchControls({ input, view, layout, orientation, canRotate, canZoom, interactLabel, onInteract, onZoom }: TouchControlsProps) {
  useEffect(() => {
    const release = () => {
      view.current.spin = 0;
    };
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('blur', release);
      release();
    };
  }, [view]);
  return (
    <div className={`touch-ui touch-${layout} touch-${orientation}`} data-testid="touch-controls">
      <Joystick input={input} />
      <div className="touch-cluster">
        {canZoom ? (
          <div className="touch-row touch-zoom">
            <button type="button" className="touch-btn touch-small" aria-label="Zoom out" onClick={() => onZoom(-1)}>
              −
            </button>
            <button type="button" className="touch-btn touch-small" aria-label="Zoom in" onClick={() => onZoom(1)}>
              +
            </button>
          </div>
        ) : null}
        {canRotate ? (
          <div className="touch-row">
            <RotateButton view={view} dir={-1} label="Rotate camera left (hold)">
              <span aria-hidden="true">⟲</span>
            </RotateButton>
            <RotateButton view={view} dir={1} label="Rotate camera right (hold)">
              <span aria-hidden="true">⟳</span>
            </RotateButton>
          </div>
        ) : null}
        <div className="touch-act-slot">
          {interactLabel ? (
            <button type="button" className="touch-btn touch-act" aria-label={`Interact with ${interactLabel}`} onClick={onInteract} onContextMenu={(e) => e.preventDefault()}>
              <span aria-hidden="true" className="touch-act-icon">
                ✋
              </span>
              <span className="touch-act-text">Interact</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
