import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges every static, single-material mesh below it into one mesh per
 * (material, shadow-casting) pair after mount, then hides the originals.
 * Turns hundreds of furniture draw calls into a few dozen without changing how
 * the furniture is authored. Only wrap content that never changes after mount
 * (no hover/glow props, no animation) — interactive objects stay outside.
 */
export function StaticBatch({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    root.updateWorldMatrix(true, true);
    const toLocal = root.matrixWorld.clone().invert();
    const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
    const hidden: THREE.Mesh[] = [];
    const m4 = new THREE.Matrix4();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.userData.noBatch) return;
      let visible = true;
      for (let p: THREE.Object3D | null = mesh; p && p !== root; p = p.parent) if (!p.visible) visible = false;
      if (!visible) return;
      m4.multiplyMatrices(toLocal, mesh.matrixWorld);
      if (m4.determinant() < 0) return; // mirrored transforms would flip winding
      const src = mesh.geometry;
      const g = src.index ? src.toNonIndexed() : src.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
      g.clearGroups();
      g.morphAttributes = {};
      g.applyMatrix4(m4);
      const mat = mesh.material as THREE.Material;
      const key = `${mat.uuid}|${mesh.castShadow ? 1 : 0}`;
      const b = buckets.get(key) ?? { mat, cast: mesh.castShadow, geos: [] };
      b.geos.push(g);
      buckets.set(key, b);
      hidden.push(mesh);
    });
    const merged: THREE.Mesh[] = [];
    for (const b of buckets.values()) {
      const geo = b.geos.length === 1 ? b.geos[0]! : mergeGeometries(b.geos, false);
      if (b.geos.length > 1) b.geos.forEach((g) => g.dispose());
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      mesh.userData.batched = true;
      root.add(mesh);
      merged.push(mesh);
    }
    hidden.forEach((m) => (m.visible = false));
    return () => {
      merged.forEach((m) => {
        root.remove(m);
        m.geometry.dispose();
      });
      hidden.forEach((m) => (m.visible = true));
    };
  }, [enabled]);
  return <group ref={ref}>{children}</group>;
}
