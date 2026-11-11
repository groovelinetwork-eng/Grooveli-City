import { ROADS, WORLD_BOUNDS } from './layout';
import { MINOR_STREETS } from './plan';

/**
 * Street furniture derived from the street grid, shared by the 3D ground and
 * the 2D city map so both always agree.
 */
export interface Mark {
  x: number;
  z: number;
  w: number; // along x
  d: number; // along z
}

/** Park pond, relative to the park block centre (world units). */
export const PARK_POND = { dx: 4, dz: 2, r: 7 } as const;

/** Lane dashes, edge lines and zebra crossings derived from the street grid. */
export function buildMarkings(): { dashes: Mark[]; zebra: Mark[]; lines: Mark[] } {
  const dashes: Mark[] = [];
  const zebra: Mark[] = [];
  const lines: Mark[] = [];
  const vRoads = ROADS.filter((r) => r.axis === 'z' && !r.minor);
  const hRoads = ROADS.filter((r) => r.axis === 'x');
  const inJunction = (x: number, z: number) =>
    vRoads.some((v) => x > v.minX - 0.5 && x < v.maxX + 0.5) && hRoads.some((h) => z > h.minZ - 0.5 && z < h.maxZ + 0.5);
  // Centre dashes
  for (const v of vRoads) {
    const cx = (v.minX + v.maxX) / 2;
    for (let z = v.minZ + 1; z < v.maxZ - 1; z += 3.2) if (!inJunction(cx, z) && !inJunction(cx, z + 1.6)) dashes.push({ x: cx, z: z + 0.8, w: 0.16, d: 1.6 });
    // Bus-lane edge line on the wide avenue west of the plaza.
    if (v.maxX - v.minX >= 6) for (let z = v.minZ + 1; z < v.maxZ - 1; z += 1) if (!inJunction(v.minX + 1.9, z)) lines.push({ x: v.minX + 1.9, z: z + 0.5, w: 0.12, d: 1 });
  }
  for (const h of hRoads) {
    const cz = (h.minZ + h.maxZ) / 2;
    for (let x = h.minX + 1; x < h.maxX - 1; x += 3.2) if (!inJunction(x, cz) && !inJunction(x + 1.6, cz)) dashes.push({ x: x + 0.8, z: cz, w: 1.6, d: 0.16 });
  }
  // Zebra crossings on each approach of every junction.
  for (const v of vRoads)
    for (const h of hRoads) {
      for (const side of [-1, 1] as const) {
        // across the vertical road, north/south of the junction
        const zc = side < 0 ? h.minZ - 1.8 : h.maxZ + 1.8;
        if (zc > WORLD_BOUNDS.minZ + 1 && zc < WORLD_BOUNDS.maxZ - 1)
          for (let x = v.minX + 0.5; x < v.maxX - 0.4; x += 0.9) zebra.push({ x: x + 0.25, z: zc, w: 0.5, d: 2.4 });
        // across the horizontal road, west/east of the junction
        const xc = side < 0 ? v.minX - 1.8 : v.maxX + 1.8;
        if (xc > WORLD_BOUNDS.minX + 1 && xc < WORLD_BOUNDS.maxX - 1)
          for (let z = h.minZ + 0.5; z < h.maxZ - 0.4; z += 0.9) zebra.push({ x: xc, z: z + 0.25, w: 2.4, d: 0.5 });
      }
    }
  // Crossing at the mouth of each minor street.
  for (const m of MINOR_STREETS) for (let x = m.minX + 0.4; x < m.maxX - 0.3; x += 0.9) zebra.push({ x: x + 0.25, z: m.maxZ - 1.6, w: 0.5, d: 2.2 });
  return { dashes, zebra, lines };
}

