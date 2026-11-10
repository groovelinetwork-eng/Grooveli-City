import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Box, Cyl, Lathe, RB } from '../apartment/Furniture';
import { Monitor, Print, RoundedSlab, Screen } from '../hq/OfficeFurniture';
import type { AiMaterials } from './aiMaterials';

/**
 * AI Career Center technology kit. Front faces +Z, pieces sit on y = 0,
 * metres. Animated pieces update transforms in useFrame (no React state) and
 * freeze when `still` (reduced motion) is set.
 */
type M = { m: AiMaterials };
const PI = Math.PI;

/** Flat arc slab (ring sector) extruded upward — curved desk tops. */
function ArcSlab({ rIn, rOut, start, len, h, y, mat }: { rIn: number; rOut: number; start: number; len: number; h: number; y: number; mat: THREE.Material }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, rOut, start, start + len, false);
    s.absarc(0, 0, rIn, start + len, start, true);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 32 });
    g.rotateX(-PI / 2);
    return g;
  }, [rIn, rOut, start, len, h]);
  return <mesh geometry={geo} position-y={y} material={mat} castShadow receiveShadow />;
}

/** Open cylinder segment (curved shell / curved display). Angle 0 = +Z. */
function Shell({ r, h, start, len, y, mat }: { r: number; h: number; start: number; len: number; y: number; mat: THREE.Material }) {
  return (
    <mesh position-y={y} material={mat} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, 40, 1, true, start, len]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ signature AI core

export function AiCore({ m, still, active }: M & { still: boolean; active: boolean }) {
  const core = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const nodes = useRef<THREE.InstancedMesh>(null);
  const points = useRef<THREE.Points>(null);
  const NODES = 18;
  const PARTICLES = 180;
  const wire = useMemo(() => new THREE.MeshBasicMaterial({ color: '#67e8f9', wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const pointMat = useMemo(
    () => new THREE.PointsMaterial({ color: '#7dd3fc', size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );
  const pointGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
    return g;
  }, []);
  const seeds = useMemo(() => Array.from({ length: PARTICLES }, (_, i) => ({ a: (i * 2.399) % (PI * 2), t: (i * 0.618) % 1, r: 0.35 + ((i * 7) % 10) / 14 })), []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const time = useRef(0);

  useFrame((_, dt) => {
    if (!still) time.current += Math.min(dt, 0.1);
    const t = time.current;
    if (core.current) {
      core.current.position.y = 1.95 + Math.sin(t * 1.2) * 0.05;
      core.current.rotation.y = t * 0.35;
    }
    rings.current.forEach((r, i) => {
      if (!r) return;
      r.rotation.x = PI / 2 + Math.sin(t * 0.4 + i) * 0.5 + i * 0.6;
      r.rotation.y = t * (0.5 + i * 0.25) * (i % 2 ? -1 : 1);
    });
    if (nodes.current) {
      for (let i = 0; i < NODES; i++) {
        const orbit = i % 3;
        const a = t * (0.6 + orbit * 0.2) + (i / NODES) * PI * 2 * 3;
        const rr = 1.15 + orbit * 0.18;
        const tilt = (orbit - 1) * 0.5;
        tmp.position.set(Math.cos(a) * rr, 1.95 + Math.sin(a) * rr * Math.sin(tilt) * 0.6 + (orbit - 1) * 0.15, Math.sin(a) * rr * Math.cos(tilt));
        tmp.scale.setScalar(i % 4 === 0 ? 1.6 : 1);
        tmp.updateMatrix();
        nodes.current.setMatrixAt(i, tmp.matrix);
      }
      nodes.current.instanceMatrix.needsUpdate = true;
    }
    if (points.current) {
      const pos = pointGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLES; i++) {
        const s = seeds[i]!;
        const k = (s.t + t * 0.12) % 1; // rise from the platform into the core
        const a = s.a + k * PI * 3;
        const rad = s.r * (1 - k) * 1.5 + 0.08;
        pos.setXYZ(i, Math.cos(a) * rad, 0.12 + k * 1.8, Math.sin(a) * rad);
      }
      pos.needsUpdate = true;
    }
  });

  const ticks = useMemo(() => Array.from({ length: 36 }, (_, i) => (i / 36) * PI * 2), []);
  return (
    <group>
      {/* platform with light inlays */}
      <Cyl r={2.05} h={0.06} at={[0, 0.03, 0]} mat={m.slate} seg={64} />
      <Cyl r={2.12} h={0.04} at={[0, 0.02, 0]} mat={m.brushed} seg={64} />
      {[
        [1.9, 1.98, m.cyanGlow],
        [1.24, 1.29, m.violetGlow],
        [0.86, 0.9, m.cyanGlow],
      ].map(([a, b, mat], i) => (
        <mesh key={i} position-y={0.062} rotation-x={-PI / 2} material={mat as THREE.Material}>
          <ringGeometry args={[a as number, b as number, 72]} />
        </mesh>
      ))}
      {ticks.map((a) => (
        <mesh key={a} position={[Math.sin(a) * 1.6, 0.064, Math.cos(a) * 1.6]} rotation-y={a} material={m.softCyan}>
          <boxGeometry args={[0.025, 0.004, 0.18]} />
        </mesh>
      ))}
      {/* plinth + lens + beam */}
      <Lathe points={[[0, 0], [0.62, 0], [0.62, 0.08], [0.42, 0.18], [0.3, 0.75], [0.4, 0.9], [0.4, 0.96], [0, 0.96]]} at={[0, 0.06, 0]} mat={m.brushed} seg={40} />
      <mesh position-y={0.1} rotation-x={-PI / 2} material={m.cyanGlow}>
        <ringGeometry args={[0.62, 0.66, 48]} />
      </mesh>
      <mesh position-y={1.03} rotation-x={-PI / 2} material={m.cyanGlow}>
        <circleGeometry args={[0.32, 32]} />
      </mesh>
      <mesh position-y={1.45} material={m.holoCyan}>
        <cylinderGeometry args={[0.1, 0.3, 0.8, 24, 1, true]} />
      </mesh>
      {/* energy core */}
      <group ref={core} position-y={1.95}>
        <mesh material={m.cyanGlow}>
          <sphereGeometry args={[0.26, 32, 24]} />
        </mesh>
        <mesh material={wire}>
          <icosahedronGeometry args={[0.5, 1]} />
        </mesh>
        <mesh material={m.holoFaint}>
          <sphereGeometry args={[0.62, 24, 16]} />
        </mesh>
      </group>
      <Billboard position-y={1.95}>
        <mesh material={m.halo} scale={active ? 2.9 : 2.3}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </Billboard>
      {[0.82, 1.0, 0.68].map((rr, i) => (
        <mesh key={i} ref={(el) => (rings.current[i] = el)} position-y={1.95} material={[m.cyanGlow, m.violetGlow, m.blueGlow][i]}>
          <torusGeometry args={[rr, i === 1 ? 0.012 : 0.018, 8, 96]} />
        </mesh>
      ))}
      <instancedMesh ref={nodes} args={[undefined, undefined, NODES]} material={m.softCyan}>
        <sphereGeometry args={[0.04, 10, 8]} />
      </instancedMesh>
      <points ref={points} geometry={pointGeo} material={pointMat} frustumCulled={false} />
    </group>
  );
}

/** Lectern terminal around the core (screen faces +Z). */
export function CoreTerminal({ m, t, glow }: M & { t: THREE.Texture; glow?: boolean }) {
  return (
    <group>
      <Cyl r={0.24} h={0.03} at={[0, 0.015, 0]} mat={m.slate} seg={24} />
      <mesh position-y={0.032} rotation-x={-PI / 2} material={m.cyanGlow}>
        <ringGeometry args={[0.22, 0.24, 32]} />
      </mesh>
      <RB size={[0.14, 0.95, 0.12]} at={[0, 0.5, -0.05]} mat={m.brushed} r={0.03} />
      <group position={[0, 1.05, 0]} rotation-x={-0.55}>
        <RB size={[0.46, 0.32, 0.04]} at={[0, 0, 0]} mat={m.navy} r={0.015} />
        <Screen w={0.42} h={0.28} t={t} at={[0, 0, 0.021]} glow={glow} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ displays

/** LED intelligence wall (front +Z) with seams and a slow scanning line. */
export function IntelligenceWall({ m, t, w, h, glow, still }: M & { t: THREE.Texture; w: number; h: number; glow?: boolean; still: boolean }) {
  const scan = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (scan.current) scan.current.position.x = still ? -w / 2 : -w / 2 + ((clock.elapsedTime * 0.18) % 1) * w;
  });
  return (
    <group>
      <RB size={[w + 0.24, h + 0.24, 0.12]} at={[0, h / 2, 0.06]} mat={m.navy} r={0.03} />
      <Screen w={w} h={h} t={t} at={[0, h / 2, 0.122]} glow={glow} />
      {[1, 2].map((k) => (
        <Box key={`v${k}`} size={[0.012, h, 0.006]} at={[-w / 2 + (k * w) / 3, h / 2, 0.126]} mat={m.navy} />
      ))}
      <Box size={[w, 0.012, 0.006]} at={[0, h / 2, 0.126]} mat={m.navy} />
      <Box size={[w + 0.24, 0.025, 0.03]} at={[0, -0.02, 0.1]} mat={m.cyanGlow} />
      <Box size={[w + 0.24, 0.025, 0.03]} at={[0, h + 0.13, 0.1]} mat={m.violetGlow} />
      <mesh ref={scan} position={[0, h / 2, 0.13]} material={m.holoCyan}>
        <planeGeometry args={[0.05, h]} />
      </mesh>
    </group>
  );
}

/** Consultation pod console: curved composite desk, curved display, task light, holo tablet. */
export function PodConsole({ m, t, glow, accent }: M & { t: THREE.Texture; glow?: boolean; accent: THREE.Material }) {
  // Seen from inside the arc the texture would read mirrored, so flip U.
  const screenMat = useMemo(() => {
    const flipped = t.clone();
    flipped.wrapS = THREE.RepeatWrapping;
    flipped.repeat.x = -1;
    flipped.offset.x = 1;
    flipped.needsUpdate = true;
    return [0.6, 1.0].map((i) => new THREE.MeshStandardMaterial({ map: flipped, emissive: '#ffffff', emissiveMap: flipped, emissiveIntensity: i, side: THREE.DoubleSide, roughness: 0.2 }));
  }, [t])[glow ? 1 : 0];
  return (
    <group>
      <RB size={[0.5, 0.7, 0.4]} at={[0, 0.35, -0.05]} mat={m.slate} r={0.04} />
      {/* desk arc, display arc and light line are concentric with the seated user (z = +0.85) */}
      <group position-z={0.85}>
        <ArcSlab rIn={0.55} rOut={1.15} start={PI / 2 - 0.62} len={1.24} h={0.04} y={0.72} mat={m.whiteComposite} />
        <Shell r={0.56} h={0.035} start={PI - 0.6} len={1.2} y={0.74} mat={accent} />
        <mesh position-y={1.27} material={screenMat}>
          <cylinderGeometry args={[1.08, 1.08, 0.55, 40, 1, true, PI - 0.6, 1.2]} />
        </mesh>
        <Shell r={1.1} h={0.62} start={PI - 0.62} len={1.24} y={1.27} mat={m.navy} />
      </group>
      <Box size={[0.03, 0.42, 0.03]} at={[0, 0.95, -0.24]} mat={m.brushed} />
      {/* task light bar */}
      <group position={[0.48, 0.74, -0.12]}>
        <Box size={[0.02, 0.4, 0.02]} at={[0, 0.2, 0]} mat={m.brushed} />
        <Box size={[0.2, 0.02, 0.05]} at={[-0.08, 0.41, 0.03]} mat={m.brushed} />
        <Box size={[0.18, 0.006, 0.04]} at={[-0.08, 0.398, 0.03]} mat={m.lightPanel} />
      </group>
      <group position={[-0.32, 0.765, 0.05]} rotation-y={0.3}>
        <RB size={[0.22, 0.012, 0.3]} at={[0, 0, 0]} mat={m.navy} r={0.008} />
        <mesh position={[0, 0.008, 0]} rotation-x={-PI / 2} material={accent}>
          <planeGeometry args={[0.19, 0.26]} />
        </mesh>
      </group>
    </group>
  );
}

/** Holographic career-pathway table: projection grid, category nodes, links and labels. */
export function HoloTable({ m, grid, labels, still, glow }: M & { grid: THREE.Texture; labels: { tex: THREE.Texture; color: string }[]; still: boolean; glow?: boolean }) {
  const spin = useRef<THREE.Group>(null);
  const time = useRef(0);
  const n = labels.length;
  const layout = useMemo(() => {
    const cats = labels.map((l, i) => {
      const a = (i / n) * PI * 2;
      return { x: Math.cos(a) * 0.62, z: Math.sin(a) * 0.62, y: 0.55 + (i % 2) * 0.14, color: l.color, a };
    });
    const subs = cats.flatMap((c, i) => [0, 1].map((k) => ({ x: c.x + Math.cos(c.a + (k ? 0.5 : -0.5)) * 0.3, z: c.z + Math.sin(c.a + (k ? 0.5 : -0.5)) * 0.3, y: c.y + 0.22 + k * 0.08, color: c.color, parent: i })));
    const pts: number[] = [];
    cats.forEach((c) => pts.push(0, 0.32, 0, c.x, c.y, c.z));
    subs.forEach((s) => {
      const c = cats[s.parent]!;
      pts.push(c.x, c.y, c.z, s.x, s.y, s.z);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return { cats, subs, lines: g };
  }, [labels, n]);
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const nodeMats = useMemo(() => new Map(labels.map((l) => [l.color, new THREE.MeshStandardMaterial({ color: l.color, emissive: l.color, emissiveIntensity: 1.8, toneMapped: false })])), [labels]);
  const gridMat = useMemo(() => new THREE.MeshStandardMaterial({ map: grid, emissive: '#ffffff', emissiveMap: grid, emissiveIntensity: 0.9, roughness: 0.1 }), [grid]);
  useFrame((_, dt) => {
    if (!still) time.current += Math.min(dt, 0.1);
    if (spin.current) {
      spin.current.rotation.y = time.current * 0.12;
      spin.current.position.y = 0.78 + Math.sin(time.current * 0.8) * 0.02;
    }
  });
  return (
    <group>
      <Lathe points={[[0, 0], [0.7, 0], [0.7, 0.04], [0.45, 0.12], [0.4, 0.68], [0.98, 0.72], [0.98, 0.76], [0, 0.76]]} at={[0, 0, 0]} mat={m.slate} seg={48} />
      <mesh position-y={0.762} rotation-x={-PI / 2} material={gridMat}>
        <circleGeometry args={[0.95, 48]} />
      </mesh>
      <mesh position-y={0.74} rotation-x={-PI / 2} material={glow ? m.cyanGlow : m.softCyan}>
        <ringGeometry args={[0.96, 1.0, 64]} />
      </mesh>
      <mesh position-y={1.2} material={m.holoFaint}>
        <cylinderGeometry args={[0.95, 0.95, 0.85, 40, 1, true]} />
      </mesh>
      <group ref={spin} position-y={0.78}>
        <lineSegments geometry={layout.lines} material={lineMat} />
        <mesh position-y={0.32} material={m.cyanGlow}>
          <sphereGeometry args={[0.06, 16, 12]} />
        </mesh>
        {layout.cats.map((c, i) => (
          <group key={i} position={[c.x, c.y, c.z]}>
            <mesh material={nodeMats.get(c.color)}>
              <sphereGeometry args={[0.05, 14, 10]} />
            </mesh>
            <Billboard position-y={0.13}>
              <mesh>
                <planeGeometry args={[0.36, 0.11]} />
                <meshBasicMaterial map={labels[i]!.tex} transparent depthWrite={false} toneMapped={false} />
              </mesh>
            </Billboard>
          </group>
        ))}
        {layout.subs.map((s, i) => (
          <mesh key={i} position={[s.x, s.y, s.z]} material={nodeMats.get(s.color)}>
            <sphereGeometry args={[0.03, 10, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Slim digital totem (milestones). */
export function SlimTotem({ m, t, glow }: M & { t: THREE.Texture; glow?: boolean }) {
  return (
    <group>
      <RB size={[0.5, 0.04, 0.3]} at={[0, 0.02, 0]} mat={m.slate} r={0.01} />
      <RB size={[0.46, 1.75, 0.08]} at={[0, 0.92, 0]} mat={m.navy} r={0.02} />
      <Screen w={0.4} h={1.6} t={t} at={[0, 0.94, 0.041]} glow={glow} />
      <Box size={[0.46, 0.02, 0.02]} at={[0, 1.81, 0.03]} mat={m.violetGlow} />
    </group>
  );
}

// ------------------------------------------------------------------ technology props

/** Server rack with perforated door and blinking status LEDs. */
export function ServerRack({ m, v = 0, still }: M & { v?: number; still: boolean }) {
  const leds = useRef<THREE.InstancedMesh>(null);
  const N = 10;
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => {
    const c = new THREE.Color();
    return Array.from({ length: N }, (_, i) => c.set(i % 3 === 0 ? '#22d3ee' : i % 3 === 1 ? '#34d399' : '#a78bfa').clone());
  }, []);
  useFrame(({ clock }) => {
    const im = leds.current;
    if (!im) return;
    for (let i = 0; i < N; i++) {
      const on = still || Math.sin(clock.elapsedTime * (3 + ((i * 7 + v) % 5)) + i) > -0.2;
      tmp.position.set(-0.22, 0.25 + i * 0.17, 0.302);
      tmp.scale.setScalar(on ? 1 : 0.001);
      tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix);
      im.setColorAt(i, colors[i]!);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <RB size={[0.6, 2.0, 0.6]} at={[0, 1.0, 0]} mat={m.navy} r={0.02} />
      <mesh position={[0.04, 1.0, 0.301]} material={m.rack}>
        <planeGeometry args={[0.46, 1.85]} />
      </mesh>
      <Box size={[0.02, 1.85, 0.02]} at={[0.24, 1.0, 0.31]} mat={m.brushed} />
      <Box size={[0.6, 0.03, 0.04]} at={[0, 2.0, 0.29]} mat={m.cyanGlow} />
      <instancedMesh ref={leds} args={[undefined, undefined, N]}>
        <boxGeometry args={[0.05, 0.02, 0.006]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Small service robot: wheeled base, body, visor head; gentle hover bob and head scan. */
export function ServiceRobot({ m, still, motion }: M & { still: boolean; motion?: MutableRefObject<number> }) {
  const head = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = still ? 0 : clock.elapsedTime;
    if (head.current) head.current.rotation.y = Math.sin(t * 0.7) * 0.6;
    if (body.current) body.current.position.y = Math.sin(t * 2.2) * 0.012 + (motion?.current ? Math.sin(t * 9) * 0.006 : 0);
  });
  return (
    <group>
      <Cyl r={0.22} h={0.08} at={[0, 0.06, 0]} mat={m.slate} seg={24} />
      <mesh position-y={0.04} rotation-x={-PI / 2} material={m.cyanGlow}>
        <ringGeometry args={[0.22, 0.24, 32]} />
      </mesh>
      <group ref={body}>
        <mesh position-y={0.42} material={m.whiteComposite} castShadow>
          <capsuleGeometry args={[0.18, 0.36, 8, 20]} />
        </mesh>
        <RB size={[0.16, 0.12, 0.02]} at={[0, 0.48, 0.175]} mat={m.navy} r={0.01} />
        <Box size={[0.1, 0.012, 0.004]} at={[0, 0.5, 0.187]} mat={m.cyanGlow} />
        <Cyl r={0.04} h={0.08} at={[0, 0.74, 0]} mat={m.brushed} seg={12} />
        <group ref={head} position-y={0.86}>
          <mesh material={m.whiteComposite} castShadow>
            <sphereGeometry args={[0.15, 24, 18]} />
          </mesh>
          <mesh position={[0, 0.0, 0.035]} scale={[1, 0.55, 0.9]} material={m.navy}>
            <sphereGeometry args={[0.13, 20, 14, -PI / 2.2, PI / 1.1]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.045, 0.01, 0.142]} material={m.cyanGlow}>
              <sphereGeometry args={[0.018, 10, 8]} />
            </mesh>
          ))}
          <Cyl r={0.006} h={0.1} at={[0.06, 0.17, 0]} mat={m.brushed} seg={6} />
          <mesh position={[0.06, 0.225, 0]} material={m.violetGlow}>
            <sphereGeometry args={[0.014, 8, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Structural column with light rings and a vertical light slit. */
export function TechColumn({ m, h }: M & { h: number }) {
  return (
    <group>
      <Cyl r={0.22} h={h} at={[0, h / 2, 0]} mat={m.whiteComposite} seg={28} />
      {[0.12, h - 0.25].map((y) => (
        <mesh key={y} position-y={y} rotation-x={PI / 2} material={m.cyanGlow}>
          <torusGeometry args={[0.225, 0.012, 6, 40]} />
        </mesh>
      ))}
      <Box size={[0.03, h - 0.6, 0.012]} at={[0, h / 2, 0.218]} mat={m.softCyan} />
    </group>
  );
}

/** Futuristic reception desk: curved white composite front with light line, staff screens behind. */
export function AiReceptionDesk({ m, brand, screen, glow }: M & { brand: THREE.Texture; screen: THREE.Texture; glow?: boolean }) {
  return (
    <group>
      <group position-z={-1.1}>
        <Shell r={1.6} h={1.05} start={-0.78} len={1.56} y={0.53} mat={m.whiteComposite} />
        <Shell r={1.58} h={1.05} start={-0.78} len={1.56} y={0.53} mat={m.whiteComposite} />
        <Shell r={1.615} h={0.03} start={-0.76} len={1.52} y={0.12} mat={glow ? m.cyanGlow : m.softCyan} />
        <ArcSlab rIn={1.05} rOut={1.7} start={-PI / 2 - 0.8} len={1.6} h={0.05} y={1.05} mat={m.marble} />
        <ArcSlab rIn={0.95} rOut={1.45} start={-PI / 2 - 0.75} len={1.5} h={0.035} y={0.74} mat={m.whiteComposite} />
      </group>
      <Print w={0.9} h={0.225} t={brand} at={[0, 0.66, 0.505]} />
      {[-0.55, 0.55].map((x, i) => (
        <group key={x} position={[x, 0.775, -0.2]} rotation-y={PI + (i ? -0.25 : 0.25)}>
          <Monitor m={m} t={screen} w={0.5} />
        </group>
      ))}
    </group>
  );
}

/** Interview recording camera on a tripod (lens faces +Z). */
export function CameraTripod({ m }: M) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <Box key={i} size={[0.02, 1.25, 0.02]} at={[Math.sin((i / 3) * PI * 2) * 0.18, 0.6, Math.cos((i / 3) * PI * 2) * 0.18]} mat={m.darkMetal} rot={[Math.cos((i / 3) * PI * 2) * -0.27, 0, Math.sin((i / 3) * PI * 2) * 0.27]} />
      ))}
      <RB size={[0.16, 0.12, 0.24]} at={[0, 1.28, 0]} mat={m.blackPlastic} r={0.02} />
      <Cyl r={0.045} h={0.1} at={[0, 1.28, 0.16]} mat={m.blackPlastic} rot={[PI / 2, 0, 0]} seg={16} />
      <mesh position={[0, 1.28, 0.212]} rotation-x={PI / 2} material={m.glassPane}>
        <circleGeometry args={[0.035, 16]} />
      </mesh>
      <mesh position={[0.06, 1.35, 0.1]} material={m.redPlastic}>
        <sphereGeometry args={[0.012, 8, 6]} />
      </mesh>
    </group>
  );
}

/** Feedback monitor on a stand. */
export function FeedbackStand({ m, t }: M & { t: THREE.Texture }) {
  return (
    <group>
      <RB size={[0.5, 0.03, 0.4]} at={[0, 0.015, 0]} mat={m.slate} r={0.01} />
      <Cyl r={0.025} h={1.05} at={[0, 0.55, 0]} mat={m.brushed} seg={10} />
      <group position-y={1.0}>
        <Monitor m={m} t={t} w={0.62} />
      </group>
    </group>
  );
}

/** Round collaborative table with a light ring and a small projection. */
export function CollabTable({ m }: M) {
  return (
    <group>
      <Cyl r={0.3} h={0.03} at={[0, 0.015, 0]} mat={m.slate} seg={24} />
      <Cyl r={0.06} h={0.72} at={[0, 0.37, 0]} mat={m.brushed} seg={12} />
      <Cyl r={0.5} h={0.035} at={[0, 0.74, 0]} mat={m.whiteComposite} seg={40} />
      <mesh position-y={0.759} rotation-x={-PI / 2} material={m.cyanGlow}>
        <ringGeometry args={[0.44, 0.46, 48]} />
      </mesh>
      <mesh position-y={0.9} material={m.holoCyan}>
        <cylinderGeometry args={[0.02, 0.16, 0.26, 16, 1, true]} />
      </mesh>
      <RoundedSlab w={0.2} d={0.14} h={0.01} r={0.02} mat={m.navy} at={[0.18, 0.76, 0.1]} />
    </group>
  );
}

/** Acoustic wall panel (front +Z). */
export function AcousticPanel({ m, w, h }: M & { w: number; h: number }) {
  return <RB size={[w, h, 0.05]} at={[0, 0, 0.025]} mat={m.acoustic} r={0.015} />;
}

/** Suspended halo light ring (over the core). */
export function HaloLight({ m, r, y, top }: M & { r: number; y: number; top: number }) {
  return (
    <group>
      <mesh position-y={y} rotation-x={PI / 2} material={m.brushed}>
        <torusGeometry args={[r, 0.025, 8, 96]} />
      </mesh>
      <mesh position-y={y - 0.028} rotation-x={PI / 2} material={m.cyanGlow}>
        <torusGeometry args={[r, 0.012, 6, 96]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <Cyl key={i} r={0.005} h={top - y} at={[Math.cos((i * PI) / 2) * r, (top + y) / 2, Math.sin((i * PI) / 2) * r]} mat={m.darkMetal} seg={4} />
      ))}
    </group>
  );
}
