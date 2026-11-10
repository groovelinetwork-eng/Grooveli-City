import type { AABB, Vec2 } from './layout';

/**
 * Walkability grid + A* for interiors with internal walls (the HQ). Cells are
 * blocked when a circle of `radius` centred in them would overlap a collider
 * or leave the bounds, so any returned path is walkable by the player.
 */
export interface NavGrid {
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  blocked: Uint8Array;
}

function circleHitsBox(x: number, z: number, r: number, b: AABB) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

export function buildNavGrid(bounds: AABB, colliders: AABB[], radius: number, cell = 0.2): NavGrid {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = bounds.minX + (c + 0.5) * cell;
      const z = bounds.minZ + (r + 0.5) * cell;
      const outside = x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius;
      blocked[r * cols + c] = outside || colliders.some((b) => circleHitsBox(x, z, radius, b)) ? 1 : 0;
    }
  return { cell, cols, rows, minX: bounds.minX, minZ: bounds.minZ, blocked };
}

export function cellOf(g: NavGrid, p: Vec2): [number, number] {
  return [Math.max(0, Math.min(g.cols - 1, Math.floor((p.x - g.minX) / g.cell))), Math.max(0, Math.min(g.rows - 1, Math.floor((p.z - g.minZ) / g.cell)))];
}

function centre(g: NavGrid, c: number, r: number): Vec2 {
  return { x: g.minX + (c + 0.5) * g.cell, z: g.minZ + (r + 0.5) * g.cell };
}

export function isWalkable(g: NavGrid, p: Vec2) {
  const [c, r] = cellOf(g, p);
  return !g.blocked[r * g.cols + c];
}

/** Nearest open cell to a point (clicks on furniture resolve to the floor beside it). */
export function nearestOpen(g: NavGrid, p: Vec2, maxRing = 12): Vec2 | null {
  const [c0, r0] = cellOf(g, p);
  if (!g.blocked[r0 * g.cols + c0]) return centre(g, c0, r0);
  for (let ring = 1; ring <= maxRing; ring++) {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let dr = -ring; dr <= ring; dr++)
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || g.blocked[r * g.cols + c]) continue;
        const q = centre(g, c, r);
        const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    if (best) return best;
  }
  return null;
}

/** Straight segment stays on open cells (sampled at quarter-cell spacing). */
function clearLine(g: NavGrid, a: Vec2, b: Vec2) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / (g.cell * 0.25)));
  for (let i = 0; i <= n; i++) if (!isWalkable(g, { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n })) return false;
  return true;
}

/** A* over 8-connected cells; returns smoothed waypoints (excluding the start) or null when unreachable. */
export function findPath(g: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const goal = nearestOpen(g, to);
  const start = nearestOpen(g, from, 4);
  if (!goal || !start) return null;
  if (clearLine(g, from, goal)) return [goal];
  const [sc, sr] = cellOf(g, start);
  const [gc, gr] = cellOf(g, goal);
  const N = g.cols * g.rows;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open: number[] = [];
  const f = new Float32Array(N).fill(Infinity);
  const h = (i: number) => {
    const c = i % g.cols;
    const r = (i / g.cols) | 0;
    const dx = Math.abs(c - gc);
    const dz = Math.abs(r - gr);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const s = sr * g.cols + sc;
  const target = gr * g.cols + gc;
  gScore[s] = 0;
  f[s] = h(s);
  open.push(s);
  while (open.length) {
    // Small grids: linear scan for the lowest f is fast enough and allocation-free.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]!]! < f[open[bi]!]!) bi = i;
    const cur = open[bi]!;
    open[bi] = open[open.length - 1]!;
    open.pop();
    if (cur === target) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % g.cols;
    const cr = (cur / g.cols) | 0;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
        const ni = nr * g.cols + nc;
        if (g.blocked[ni] || closed[ni]) continue;
        // No corner cutting through blocked cells.
        if (dr && dc && (g.blocked[cr * g.cols + nc] || g.blocked[nr * g.cols + cc])) continue;
        const cost = gScore[cur]! + (dr && dc ? Math.SQRT2 : 1);
        if (cost < gScore[ni]!) {
          gScore[ni] = cost;
          f[ni] = cost + h(ni);
          came[ni] = cur;
          open.push(ni);
        }
      }
  }
  if (came[target] === -1 && target !== s) return null;
  const cells: Vec2[] = [];
  for (let i = target; i !== -1 && i !== s; i = came[i]!) cells.push(centre(g, i % g.cols, (i / g.cols) | 0));
  cells.reverse();
  cells[cells.length - 1] = goal;
  // String-pulling: keep only waypoints needed to stay on open cells.
  const out: Vec2[] = [];
  let anchor = from;
  for (let i = 0; i < cells.length; i++) {
    const next = cells[i + 1];
    if (!next || !clearLine(g, anchor, next)) {
      out.push(cells[i]!);
      anchor = cells[i]!;
    }
  }
  return out;
}
