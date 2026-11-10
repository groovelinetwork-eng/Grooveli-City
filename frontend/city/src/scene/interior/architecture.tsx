import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { partitionSegments, type Partition } from '../../world/interior';
import type { AABB } from '../../world/layout';

/**
 * Shared interior architecture: zone floors with world-space UVs, glass runs
 * with doors, fabric dividers, balustrades and cutaway exterior walls. Materials
 * are passed in so each building keeps its own palette.
 */
export interface ArchMaterials {
  darkFrame: THREE.Material;
  glassPane: THREE.Material;
  frosted: THREE.Material;
  stainless: THREE.Material;
  aluminium: THREE.Material;
  /** Divider panel fabric. */
  dividerFabric: THREE.Material;
  /** Exterior shell / caps. */
  shell: THREE.Material;
  /** Inner face of exterior walls. */
  innerWall: THREE.Material;
  /** Top of low walls. */
  coping: THREE.Material;
  trim: THREE.Material;
}

const PI = Math.PI;

/** Floor plane with world-space UVs so every zone tiles at true scale from one material. */
export function ZoneFloor({ rect, mat, tile, y }: { rect: AABB; mat: THREE.Material; tile: number; y: number }) {
  const geo = useMemo(() => {
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-PI / 2);
    g.translate((rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2);
    const pos = g.attributes.position!;
    const uv = g.attributes.uv!;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, -pos.getZ(i) / tile);
    return g;
  }, [rect, tile]);
  return <mesh geometry={geo} position-y={y} material={mat} receiveShadow />;
}

/** Glass (or frosted) partition with mullions, manifestation band and sliding door leaves. */
export function GlassRun({ m, p }: { m: ArchMaterials; p: Partition }) {
  const H = p.height;
  const frosted = p.kind === 'frosted';
  const seg = partitionSegments(p);
  const place = (a: number, b: number, y: number, size: [number, number, number], mat: THREE.Material, key: string, off = 0) => {
    const c = (a + b) / 2;
    const len = b - a;
    return (
      <mesh key={key} position={p.axis === 'x' ? [c, y, p.at + off] : [p.at + off, y, c]} material={mat} castShadow={mat !== m.glassPane && mat !== m.frosted} receiveShadow>
        <boxGeometry args={p.axis === 'x' ? [len, size[1], size[2]] : [size[2], size[1], len]} />
      </mesh>
    );
  };
  const nodes: ReactNode[] = [];
  seg.forEach(([a, b], i) => {
    nodes.push(place(a, b, 0.03, [0, 0.06, 0.07], m.darkFrame, `bot${i}`));
    nodes.push(place(a, b, H - 0.03, [0, 0.06, 0.07], m.darkFrame, `top${i}`));
    if (frosted) {
      nodes.push(place(a, b, 0.9, [0, 1.68, 0.014], m.frosted, `fr${i}`));
      nodes.push(place(a, b, (1.74 + H - 0.06) / 2, [0, H - 1.8, 0.012], m.glassPane, `gl${i}`));
    } else {
      nodes.push(place(a, b, H / 2, [0, H - 0.12, 0.012], m.glassPane, `gl${i}`));
      nodes.push(place(a, b, 1.22, [0, 0.12, 0.016], m.frosted, `band${i}`));
    }
    const n = Math.max(1, Math.ceil((b - a) / 1.25));
    for (let k = 0; k <= n; k++) {
      const t = a + ((b - a) * k) / n;
      nodes.push(place(t - 0.025, t + 0.025, H / 2, [0, H, 0.07], m.darkFrame, `mul${i}-${k}`));
    }
  });
  // door openings: header + transom glass + a sliding leaf parked against the next run
  (p.doors ?? []).forEach(([a, b], i) => {
    const counter = p.counters?.includes(i) ?? false;
    nodes.push(place(a, b, counter ? 2.0 : 2.2, [0, 0.06, 0.08], m.darkFrame, `hdr${i}`));
    nodes.push(place(a, b, ((counter ? 2.03 : 2.23) + H) / 2, [0, H - (counter ? 2.06 : 2.26), 0.012], m.glassPane, `tr${i}`));
    if (!counter) {
      const w = b - a;
      const after = seg.some(([s]) => Math.abs(s - b) < 1e-6);
      const [la, lb] = after ? [b - 0.04, b + w - 0.04] : [a - w + 0.04, a + 0.04];
      nodes.push(place(la, lb, 1.1, [0, 2.14, 0.014], m.glassPane, `leaf${i}`, 0.06));
      nodes.push(place(la + 0.02, la + 0.06, 1.1, [0, 2.14, 0.04], m.darkFrame, `lf${i}`, 0.06));
      nodes.push(place(lb - 0.06, lb - 0.02, 1.1, [0, 2.14, 0.04], m.darkFrame, `lr${i}`, 0.06));
      const hx = after ? la + 0.12 : lb - 0.12;
      nodes.push(place(hx - 0.012, hx + 0.012, 1.05, [0, 0.5, 0.05], m.stainless, `h${i}`, 0.1));
    }
  });
  return <group>{nodes}</group>;
}

export function Divider({ m, p }: { m: ArchMaterials; p: Partition }) {
  const len = p.to - p.from;
  const c = (p.from + p.to) / 2;
  return (
    <group position={p.axis === 'z' ? [p.at, 0, c] : [c, 0, p.at]} rotation-y={p.axis === 'z' ? PI / 2 : 0}>
      <mesh position={[0, p.height / 2, 0]} material={m.dividerFabric} castShadow receiveShadow>
        <boxGeometry args={[len, p.height, 0.06]} />
      </mesh>
      <mesh position={[0, p.height + 0.012, 0]} material={m.aluminium}>
        <boxGeometry args={[len, 0.025, 0.07]} />
      </mesh>
    </group>
  );
}

export function Balustrade({ m, p }: { m: ArchMaterials; p: Partition }) {
  const len = p.to - p.from;
  const c = (p.from + p.to) / 2;
  return (
    <group position={p.axis === 'x' ? [c, 0, p.at] : [p.at, 0, c]} rotation-y={p.axis === 'z' ? PI / 2 : 0}>
      <mesh position={[0, 0.52, 0]} material={m.glassPane}>
        <boxGeometry args={[len, 0.96, 0.014]} />
      </mesh>
      <mesh position={[0, 1.03, 0]} material={m.stainless} castShadow>
        <boxGeometry args={[len, 0.04, 0.05]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * len) / 2, 0.52, 0]} material={m.stainless} castShadow>
          <boxGeometry args={[0.05, 1.04, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

/** Cutaway exterior wall: full height at the back (inner face +X / +Z), low walls at the camera side. */
export function ExteriorWall({ m, p, wallT }: { m: ArchMaterials; p: Partition; wallT: number }) {
  const t = wallT;
  const h = p.height;
  const full = p.kind === 'wall';
  // Box faces: +x, −x, +y, −y, +z, −z. Inner faces use innerWall; the outer face of the low walls faces the camera.
  const mats = useMemo(() => {
    if (p.axis === 'x') return full ? [m.shell, m.shell, m.shell, m.shell, m.innerWall, m.shell] : [m.shell, m.shell, m.coping, m.shell, m.shell, m.innerWall];
    return full ? [m.innerWall, m.shell, m.shell, m.shell, m.shell, m.shell] : [m.shell, m.innerWall, m.coping, m.shell, m.shell, m.shell];
  }, [m, p.axis, full]);
  return (
    <group>
      {partitionSegments(p).map(([a, b], i) => {
        const c = (a + b) / 2;
        const thick = full ? t : 0.18;
        // full walls overlap at the back corner so it reads as one solid return
        const len = b - a + (full && p.axis === 'x' ? t : 0);
        const pos: [number, number, number] = p.axis === 'x' ? [c - (full ? t / 2 : 0), h / 2, p.at] : [p.at, h / 2, c];
        const size: [number, number, number] = p.axis === 'x' ? [len, h, thick] : [thick, h, len];
        return (
          <group key={i}>
            <mesh position={pos} material={mats} castShadow receiveShadow>
              <boxGeometry args={size} />
            </mesh>
            {full ? (
              <>
                <mesh position={p.axis === 'x' ? [pos[0], h + 0.04, p.at] : [p.at, h + 0.04, c]} material={m.shell} castShadow>
                  <boxGeometry args={p.axis === 'x' ? [size[0] + 0.04, 0.08, t + 0.06] : [t + 0.06, 0.08, size[2] + 0.04]} />
                </mesh>
                <mesh position={p.axis === 'x' ? [pos[0], 0.05, p.at + t / 2 + 0.01] : [p.at + t / 2 + 0.01, 0.05, c]} material={m.shell}>
                  <boxGeometry args={p.axis === 'x' ? [size[0], 0.1, 0.02] : [0.02, 0.1, size[2]]} />
                </mesh>
                <mesh position={p.axis === 'x' ? [pos[0], h - 0.1, p.at + t / 2 + 0.008] : [p.at + t / 2 + 0.008, h - 0.1, c]} material={m.trim}>
                  <boxGeometry args={p.axis === 'x' ? [size[0], 0.06, 0.016] : [0.016, 0.06, size[2]]} />
                </mesh>
              </>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

/** Renders a partition list with the right component per kind. */
export function Partitions({ m, parts, wallT }: { m: ArchMaterials; parts: Partition[]; wallT: number }) {
  return (
    <>
      {parts.map((p) =>
        p.kind === 'wall' || p.kind === 'low-wall' ? (
          <ExteriorWall key={p.id} m={m} p={p} wallT={wallT} />
        ) : p.kind === 'divider' ? (
          <Divider key={p.id} m={m} p={p} />
        ) : p.kind === 'balustrade' ? (
          <Balustrade key={p.id} m={m} p={p} />
        ) : (
          <GlassRun key={p.id} m={m} p={p} />
        ),
      )}
    </>
  );
}
