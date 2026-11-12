import { ExtrudeGeometry, Shape, type BufferGeometry } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Shared rounded-box geometry. Identical to drei's <RoundedBox> (same shape,
 * extrusion and crease-angle normals) but built once per size and reused by
 * every piece of furniture and every visit — drei rebuilt it, normals and all,
 * for each piece, the single largest cost of building an interior.
 * Cached geometries are shared, so they are never disposed by their meshes.
 */
const EPS = 0.00001;
const cache = new Map<string, BufferGeometry>();

function createShape(width: number, height: number, radius0: number) {
  const shape = new Shape();
  const radius = radius0 - EPS;
  shape.absarc(EPS, EPS, EPS, -Math.PI / 2, -Math.PI, true);
  shape.absarc(EPS, height - radius * 2, EPS, Math.PI, Math.PI / 2, true);
  shape.absarc(width - radius * 2, height - radius * 2, EPS, Math.PI / 2, 0, true);
  shape.absarc(width - radius * 2, EPS, EPS, 0, -Math.PI / 2, true);
  return shape;
}

export function roundedBoxGeometry(width: number, height: number, depth: number, radius: number, smoothness = 4, bevelSegments = 4, creaseAngle = 0.4): BufferGeometry {
  const key = `${width}|${height}|${depth}|${radius}|${smoothness}|${bevelSegments}|${creaseAngle}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new ExtrudeGeometry(createShape(width, height, radius), {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelSegments: bevelSegments * 2,
    steps: 1,
    bevelSize: radius - EPS,
    bevelThickness: radius,
    curveSegments: smoothness,
  });
  g.center();
  const out = toCreasedNormals(g, creaseAngle);
  out.computeBoundingSphere();
  cache.set(key, out);
  return out;
}

/** Number of distinct cached sizes (tests / diagnostics). */
export function roundedBoxCacheSize() {
  return cache.size;
}
