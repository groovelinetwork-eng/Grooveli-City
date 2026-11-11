import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { getDistrict, type DistrictId } from '@grooveli/frontend-domain/public';
import { cityMapModel, type MapBuilding, type MapDistrict } from '../world/mapData';
import type { AABB, PlacedBuilding, Vec2 } from '../world/layout';

/**
 * Cartographic city map (SVG, world coordinates: x right, z down = north up).
 * Built from the same data as the 3D city via world/mapData.ts, so roads,
 * blocks and building footprints line up with the navigable world.
 * Hover / focus / tap a district for details; select a landmark building;
 * zoom (wheel, pinch, buttons) and drag to pan.
 */
export interface CityMapProps {
  pos: Vec2;
  currentDistrict: DistrictId | null;
  variant?: 'compact' | 'full';
  onTravel: (d: DistrictId) => void;
  onOpenBuilding: (b: PlacedBuilding) => void;
  onExpand?: () => void;
}

type Selection = { type: 'district'; id: DistrictId } | { type: 'building'; id: string } | null;
interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rectsPath = (rs: { x: number; z: number; w: number; d: number }[]) => rs.map((r) => `M${r.x - r.w / 2} ${r.z - r.d / 2}h${r.w}v${r.d}h${-r.w}z`).join('');
const circlesPath = (cs: Vec2[], r: number) => cs.map((c) => `M${c.x - r} ${c.z}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`).join('');
const R = (b: AABB) => ({ x: b.minX, y: b.minZ, width: b.maxX - b.minX, height: b.maxZ - b.minZ });
const centre = (b: AABB): Vec2 => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 });

/** Footprint shade by height (taller = slightly darker roof). */
function roofShade(h: number, landmark: boolean) {
  const t = Math.min(1, h / 26);
  const l = Math.round((landmark ? 98 : 92) - t * 14);
  return `hsl(215 ${landmark ? 18 : 12}% ${l}%)`;
}

export function CityMap({ pos, currentDistrict, variant = 'compact', onTravel, onOpenBuilding, onExpand }: CityMapProps) {
  const m = useMemo(cityMapModel, []);
  const full = variant === 'full';
  const world: View = useMemo(() => {
    const pad = 4;
    return { x: m.bounds.minX - pad, y: m.bounds.minZ - pad, w: m.bounds.maxX - m.bounds.minX + pad * 2, h: m.bounds.maxZ - m.bounds.minZ + pad * 2 };
  }, [m]);
  const [view, setView] = useState<View>(world);
  const [hover, setHover] = useState<Selection>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 360, h: 225 });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 360, h: el.clientHeight || 225 });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** World units per screen pixel (SVG uses "meet" fitting). */
  const k = Math.max(view.w / size.w, view.h / size.h);
  const px = (n: number) => n * k;

  // ---------------------------------------------------------------- zoom & pan
  const clampView = useCallback(
    (v: View): View => {
      const w = Math.min(world.w, Math.max(28, v.w));
      const h = (w * world.h) / world.w;
      const x = Math.min(world.x + world.w - w * 0.5, Math.max(world.x - w * 0.5, v.x));
      const y = Math.min(world.y + world.h - h * 0.5, Math.max(world.y - h * 0.5, v.y));
      return { x, y, w, h };
    },
    [world],
  );
  const toWorld = (clientX: number, clientY: number): Vec2 | null => {
    const s = svg.current;
    const ctm = s?.getScreenCTM?.();
    if (!s || !ctm || typeof s.createSVGPoint !== 'function') return null;
    const p = s.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const q = p.matrixTransform(ctm.inverse());
    return { x: q.x, z: q.y };
  };
  const zoomAt = useCallback(
    (factor: number, at?: Vec2) => {
      setView((v) => {
        const c = at ?? { x: v.x + v.w / 2, z: v.y + v.h / 2 };
        const w = Math.min(world.w, Math.max(28, v.w * factor));
        const f = w / v.w;
        return clampView({ x: c.x - (c.x - v.x) * f, y: c.z - (c.z - v.y) * f, w, h: v.h * f });
      });
    },
    [world, clampView],
  );
  const reset = () => setView(world);

  useEffect(() => {
    const s = svg.current;
    if (!s) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0015), toWorld(e.clientX, e.clientY) ?? undefined);
    };
    s.addEventListener('wheel', onWheel, { passive: false });
    return () => s.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; pinch: number | null }>({ moved: false, pinch: null });
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.moved = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size === 2 && drag.current.pinch) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = toWorld((a!.x + b!.x) / 2, (a!.y + b!.y) / 2) ?? undefined;
      zoomAt(drag.current.pinch / d, mid);
      drag.current.pinch = d;
      drag.current.moved = true;
      return;
    }
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    if (!drag.current.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.current.moved) svg.current?.setPointerCapture?.(e.pointerId);
    drag.current.moved = true;
    setView((v) => clampView({ ...v, x: v.x - dx * k, y: v.y - dy * k }));
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) drag.current.pinch = null;
  };
  const tap = (fn: () => void) => () => {
    if (drag.current.moved) return; // a pan, not a tap
    fn();
  };

  // ---------------------------------------------------------------- static base layers (memoised; never re-render on pan)
  const base = useMemo(() => {
    const parkC = centre(m.park.lot);
    return (
      <g className="citymap-base">
        <rect x={world.x - 40} y={world.y - 40} width={world.w + 80} height={world.h + 80} className="cm-green" />
        <rect {...R(m.bounds)} className="cm-asphalt" rx={2} />
        <path d={rectsPath(m.markings.dashes)} className="cm-dash" />
        <path d={rectsPath(m.markings.lines)} className="cm-dash" />
        <path d={rectsPath(m.markings.zebra)} className="cm-zebra" />
        {m.districts.map((d) =>
          d.id === 'plaza' ? null : (
            <g key={d.id}>
              <rect {...R(d.block)} rx={1.2} className="cm-sidewalk" />
              <rect {...R(d.lot)} rx={0.8} className="cm-lot" style={{ fill: d.color }} />
            </g>
          ),
        )}
        {/* Grooveli Plaza: sidewalk ring, landscaped square, light ring and disc */}
        {(() => {
          const d = m.districts.find((x) => x.id === 'plaza')!;
          return (
            <g>
              <rect {...R(d.block)} rx={1.2} className="cm-sidewalk" />
              <rect {...R(m.plaza.rect)} rx={0.8} className="cm-plaza" />
              <circle cx={m.plaza.ring.x} cy={m.plaza.ring.z} r={m.plaza.ring.radius} className="cm-plaza-ring" />
              <circle cx={m.plaza.ring.x} cy={m.plaza.ring.z} r={m.plaza.ring.discRadius} className="cm-plaza-disc" />
            </g>
          );
        })()}
        {/* Central Park */}
        <rect {...R(m.park.block)} rx={1.2} className="cm-sidewalk" />
        <rect {...R(m.park.lot)} rx={0.8} className="cm-park" />
        <circle cx={m.park.pond.x} cy={m.park.pond.z} r={m.park.pond.r} className="cm-pond" />
        {m.minorStreets.map((s, i) => (
          <rect key={i} {...R(s)} className="cm-asphalt" />
        ))}
        <path d={circlesPath(m.trees, 0.85)} className="cm-tree" />
        {/* soft building shadows (offset to the south-east, matching the sun) */}
        <path d={m.buildings.map((b) => `M${b.rect.minX + 0.9} ${b.rect.minZ + 1.1}h${b.rect.maxX - b.rect.minX}v${b.rect.maxZ - b.rect.minZ}h${-(b.rect.maxX - b.rect.minX)}z`).join('')} className="cm-shadow" />
        <text x={parkC.x} y={parkC.z - m.park.pond.r - 2} className="cm-park-label" textAnchor="middle">
          Central Park
        </text>
      </g>
    );
  }, [m, world]);

  // ---------------------------------------------------------------- interaction state
  const active = selected ?? hover;
  const activeDistrict: MapDistrict | null =
    active?.type === 'district' ? m.districts.find((d) => d.id === active.id) ?? null : active?.type === 'building' ? m.districts.find((d) => d.id === m.buildings.find((b) => b.id === active.id)?.district) ?? null : null;
  const activeBuilding: MapBuilding | null = active?.type === 'building' ? m.buildings.find((b) => b.id === active.id) ?? null : null;
  const keySelect = (s: Selection) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected(s);
    }
  };

  const font = px(full ? 13 : 10.5);
  const iconSize = px(full ? 15 : 11);
  const showBuildingNames = k < 0.22;
  /** Full district names only when a block is wide enough on screen (~40 m blocks). */
  const longLabels = full && 40 / k > 150;
  /** Controls sit in a toolbar above the map when the map is narrow, so they never cover districts. */
  const toolbar = !full || size.w < 600;

  const controls = (
    <div className="citymap-controls">
      <button type="button" className="cm-btn" onClick={() => zoomAt(0.7)} aria-label="Zoom map in">
        +
      </button>
      <button type="button" className="cm-btn" onClick={() => zoomAt(1 / 0.7)} aria-label="Zoom map out">
        −
      </button>
      <button type="button" className="cm-btn" onClick={reset} aria-label="Show whole map">
        ⤾
      </button>
      {onExpand ? (
        <button type="button" className="cm-btn cm-btn-wide" onClick={onExpand} aria-label="Open full map">
          ⤢ <span aria-hidden="true">Full map</span>
        </button>
      ) : null}
    </div>
  );

  return (
    <div className={`citymap citymap-${variant}${toolbar ? ' has-toolbar' : ''}`}>
      {toolbar ? controls : null}
      <div ref={box} className="citymap-frame">
        <svg
          ref={svg}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="City map. Choose a district or landmark for details."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHover(null)}
        >
          {base}

          {/* district hit areas (below buildings so buildings stay clickable) */}
          {m.districts.map((d) => {
            const isActive = activeDistrict?.id === d.id;
            return (
              <rect
                key={d.id}
                {...R(d.block)}
                rx={1.2}
                className={`cm-district${isActive ? ' is-active' : ''}${currentDistrict === d.id ? ' is-current' : ''}`}
                style={{ stroke: d.color, fill: isActive ? d.color : 'transparent' }}
                role="button"
                tabIndex={0}
                aria-label={`${d.name}: ${d.tagline}. Show details.`}
                aria-pressed={selected?.type === 'district' && selected.id === d.id}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setHover({ type: 'district', id: d.id })}
                onFocus={() => setHover({ type: 'district', id: d.id })}
                onBlur={() => setHover(null)}
                onClick={tap(() => setSelected({ type: 'district', id: d.id }))}
                onKeyDown={keySelect({ type: 'district', id: d.id })}
              />
            );
          })}

          {/* building footprints */}
          {m.buildings.map((b) => {
            const sel = activeBuilding?.id === b.id;
            const color = getDistrict(b.district).color;
            return (
              <rect
                key={b.id}
                {...R(b.rect)}
                rx={0.4}
                className={`cm-building${b.landmark ? ' is-landmark' : ''}${sel ? ' is-active' : ''}`}
                style={{ fill: roofShade(b.height, b.landmark), stroke: b.landmark ? color : undefined }}
                {...(b.landmark
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `${b.name}, ${getDistrict(b.district).name}. Show details.`,
                      onPointerEnter: (e: ReactPointerEvent) => e.pointerType === 'mouse' && setHover({ type: 'building', id: b.id }),
                      onFocus: () => setHover({ type: 'building', id: b.id }),
                      onBlur: () => setHover(null),
                      onClick: tap(() => setSelected({ type: 'building', id: b.id })),
                      onKeyDown: keySelect({ type: 'building', id: b.id }),
                    }
                  : { 'aria-hidden': true, onPointerEnter: (e: ReactPointerEvent) => e.pointerType === 'mouse' && setHover({ type: 'district', id: b.district }), onClick: tap(() => setSelected({ type: 'district', id: b.district })) })}
              />
            );
          })}

          {/* entrances + landmark icons */}
          {m.buildings
            .filter((b) => b.entrance)
            .map((b) => (
              <circle key={`e-${b.id}`} cx={b.entrance!.x} cy={b.entrance!.z} r={px(3.2)} className="cm-entrance" aria-hidden="true" />
            ))}
          {m.buildings
            .filter((b) => b.icon)
            .map((b) => {
              const c = centre(b.rect);
              return (
                <g key={`i-${b.id}`} aria-hidden="true" pointerEvents="none">
                  <circle cx={c.x} cy={c.z} r={iconSize * 0.78} className="cm-icon-bg" />
                  <text x={c.x} y={c.z} fontSize={iconSize} textAnchor="middle" dominantBaseline="central">
                    {b.icon}
                  </text>
                  {showBuildingNames ? (
                    <text x={c.x} y={c.z + iconSize * 1.3} fontSize={px(11)} textAnchor="middle" className="cm-label cm-building-label">
                      {b.name}
                    </text>
                  ) : null}
                </g>
              );
            })}

          {/* district names */}
          {m.districts.map((d) => {
            const c = centre(d.lot);
            const y = d.id === 'plaza' ? m.plaza.rect.maxZ - px(10) : c.z;
            return (
              <text
                key={`l-${d.id}`}
                x={c.x}
                y={y}
                fontSize={activeDistrict?.id === d.id ? font * 1.15 : font}
                textAnchor="middle"
                className={`cm-label${activeDistrict?.id === d.id ? ' is-active' : ''}`}
                aria-hidden="true"
                pointerEvents="none"
              >
                {longLabels ? d.name.replace(/ District$/, '') : d.short}
              </text>
            );
          })}

          {/* player */}
          <g aria-hidden="true" pointerEvents="none" transform={`translate(${pos.x} ${pos.z})`}>
            <circle r={px(14)} className="cm-you-pulse" />
            <circle r={px(6.5)} className="cm-you" />
            <text y={-px(11)} fontSize={px(11)} textAnchor="middle" className="cm-label cm-you-label">
              You
            </text>
          </g>
        </svg>

        {toolbar ? null : controls}
      </div>

      {/* details: preview on hover/focus, actions when selected */}
      <div className="citymap-card" aria-live="polite">
        {activeBuilding ? (
          <>
            <p className="cm-card-title">
              <span aria-hidden="true">{activeBuilding.icon}</span> {activeBuilding.name}
            </p>
            <p className="small muted">{getDistrict(activeBuilding.district).name}</p>
            {selected?.type === 'building' ? (
              <div className="row-btns">
                <button type="button" className="city-btn city-btn-primary" onClick={() => onOpenBuilding(activeBuilding.source)}>
                  Details &amp; enter
                </button>
                <button type="button" className="city-btn" onClick={() => onTravel(activeBuilding.district)}>
                  Travel to {getDistrict(activeBuilding.district).name}
                </button>
              </div>
            ) : (
              <p className="small muted">Click or tap for details.</p>
            )}
          </>
        ) : activeDistrict ? (
          <>
            <p className="cm-card-title">
              <span aria-hidden="true">{activeDistrict.icon}</span> {activeDistrict.name}
              {currentDistrict === activeDistrict.id ? <span className="cm-here"> · you are here</span> : null}
            </p>
            <p className="small">{activeDistrict.description}</p>
            {activeDistrict.landmarks.length ? <p className="small muted">Landmarks: {activeDistrict.landmarks.join(' · ')}</p> : null}
            {selected?.type === 'district' ? (
              <div className="row-btns">
                <button type="button" className="city-btn city-btn-primary" onClick={() => onTravel(activeDistrict.id)}>
                  Travel to {activeDistrict.name}
                </button>
              </div>
            ) : (
              <p className="small muted">Click or tap for actions.</p>
            )}
          </>
        ) : (
          <p className="small muted">
            {currentDistrict ? `You are in ${getDistrict(currentDistrict).name}. ` : ''}Hover or tap a district or landmark. Drag to pan, scroll or pinch to zoom.
          </p>
        )}
      </div>
    </div>
  );
}
