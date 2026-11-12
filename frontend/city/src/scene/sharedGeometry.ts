import * as THREE from 'three';

/**
 * Shared primitive geometries and plain materials. Avatars (the player,
 * simulated presence and every member of an interior's staff) used to build
 * ~25 geometries and 11 materials each on mount; identical ones are now built
 * once and reused. Shared resources are never disposed by their meshes
 * (R3F only disposes the mesh itself), so they live for the session.
 */
const makers = {
  capsule: (r: number, length: number, capSegments?: number, radialSegments?: number) => new THREE.CapsuleGeometry(r, length, capSegments, radialSegments),
  sphere: (r: number, w?: number, h?: number, phiStart?: number, phiLength?: number, thetaStart?: number, thetaLength?: number) =>
    new THREE.SphereGeometry(r, w, h, phiStart, phiLength, thetaStart, thetaLength),
  cylinder: (rTop: number, rBottom: number, h: number, segments?: number) => new THREE.CylinderGeometry(rTop, rBottom, h, segments),
  cone: (r: number, h: number, segments?: number) => new THREE.ConeGeometry(r, h, segments),
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  torus: (r: number, tube: number, radialSegments?: number, tubularSegments?: number, arc?: number) => new THREE.TorusGeometry(r, tube, radialSegments, tubularSegments, arc),
};

type Makers = typeof makers;
const geometries = new Map<string, THREE.BufferGeometry>();

export function sharedGeometry<K extends keyof Makers>(kind: K, ...args: Parameters<Makers[K]>): THREE.BufferGeometry {
  const key = `${kind}|${args.join('|')}`;
  let g = geometries.get(key);
  if (!g) {
    g = (makers[kind] as (...a: number[]) => THREE.BufferGeometry)(...(args as number[]));
    geometries.set(key, g);
  }
  return g;
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Shared MeshStandardMaterial for flat-coloured parts (no maps). Treat as read-only. */
export function sharedStandard(color: string, roughness: number, metalness = 0, emissive?: string, emissiveIntensity = 1): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${emissive ?? ''}|${emissiveIntensity}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...(emissive ? { emissive, emissiveIntensity } : {}) });
    materials.set(key, m);
  }
  return m;
}

export function sharedResourceCounts() {
  return { geometries: geometries.size, materials: materials.size };
}
