import { useEffect, useMemo, useState } from 'react';
import { createPortal, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PublicHqProjection } from '@grooveli/frontend-domain/public';
import { HqLights } from './HqLights';
import { printMat, screenMat } from './OfficeFurniture';
import { hqBrandMaterials, hqMaterials, hqTextures, isHqPrepared, isHqWarm, markHqWarm, prepareHqTextureStep } from './hqResources';

/**
 * Prepares a company HQ in the background while the player walks up to it, so
 * entering only has to place the room:
 *   1. textures & materials — drawn one at a time in browser idle time
 *   2. shaders — the HQ's materials are compiled under the HQ's own lights in a
 *      private, never-rendered scene with three's non-blocking compileAsync
 *   3. upload — textures are sent to the GPU one per idle slice
 * Nothing here is visible or interactive; if the player enters before it
 * finishes, the remaining work simply happens behind the door transition.
 */
export type PreloadStage = 'waiting' | 'materials' | 'textures' | 'shaders' | 'upload' | 'done';

/** Let the street settle (e.g. just after leaving a building) before preparing anything. */
const START_DELAY_MS = 1500;

type Deadline = () => number;

/** Runs `step` in idle slices until it returns true; returns a cancel function. */
function idleLoop(step: (timeLeft: Deadline) => boolean): () => void {
  let handle = 0;
  let cancelled = false;
  const ric = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback.bind(window) : null;
  const run = (timeLeft: Deadline) => {
    if (cancelled) return;
    if (!step(timeLeft)) schedule();
  };
  const schedule = () => {
    if (ric)
      handle = ric(
        (d) => {
          // a busy page may never be idle: when the timeout fires, still do a small (8 ms) slice
          const end = performance.now() + 8;
          run(() => (d.didTimeout ? end - performance.now() : d.timeRemaining()));
        },
        { timeout: 500 },
      );
    else {
      handle = window.setTimeout(() => {
        const end = performance.now() + 8;
        run(() => end - performance.now());
      }, 40);
    }
  };
  schedule();
  return () => {
    cancelled = true;
    if (ric) window.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}

const isMaterial = (v: unknown): v is THREE.Material => v instanceof THREE.Material;
const MAP_SLOTS = ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap'] as const;

function setStage(stage: PreloadStage) {
  document.body.dataset.preload = stage;
}

export function HqPreloader({ hq, shadows, shadowMap }: { hq: PublicHqProjection; shadows: boolean; shadowMap: number }) {
  const gl = useThree((s) => s.gl);
  // an HQ visited (or warmed) earlier this session needs nothing more
  const [stage, setLocal] = useState<PreloadStage>(() => (isHqPrepared(hq) && isHqWarm(hq) ? 'done' : 'waiting'));
  const go = (s: PreloadStage) => {
    setStage(s);
    setLocal(s);
  };

  // 1. materials, then textures, in idle time
  useEffect(() => {
    if (stage === 'done') setStage('done');
    if (stage === 'waiting') {
      setStage('waiting');
      const t = window.setTimeout(() => go('materials'), START_DELAY_MS);
      return () => window.clearTimeout(t);
    }
    if (stage === 'materials') {
      setStage('materials');
      return idleLoop(() => {
        hqMaterials();
        hqBrandMaterials(hq.organization.logoColor);
        go('textures');
        return true;
      });
    }
    if (stage === 'textures') {
      return idleLoop((timeLeft) => {
        if (isHqPrepared(hq)) {
          go('shaders');
          return true;
        }
        do {
          if (prepareHqTextureStep(hq)) {
            go('shaders');
            return true;
          }
        } while (timeLeft() > 6);
        return false;
      });
    }
    if (stage === 'upload') {
      const m = hqMaterials();
      const fromMaterials = Object.values(m)
        .filter(isMaterial)
        .flatMap((mat) => MAP_SLOTS.map((k) => (mat as unknown as Record<string, THREE.Texture | null>)[k]).filter((t): t is THREE.Texture => !!t));
      const queue = [...new Set([...hqTextures(hq), ...fromMaterials])];
      return idleLoop((timeLeft) => {
        do {
          const t = queue.shift();
          if (!t) {
            go('done');
            return true;
          }
          gl.initTexture(t);
        } while (timeLeft() > 6);
        return false;
      });
    }
  }, [stage, hq, gl]);

  return stage === 'shaders' ? (
    <ShaderWarmup
      hq={hq}
      shadows={shadows}
      shadowMap={shadowMap}
      onDone={() => {
        markHqWarm(hq);
        go('upload');
      }}
    />
  ) : null;
}

/** Inline `<meshStandardMaterial map roughness>` surfaces in the office. */
function plainMapped(map: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 1 });
  m.userData.warmupOnly = true;
  return m;
}

/** Compiles the HQ's materials under the HQ's lights in a private scene that is never rendered. */
function ShaderWarmup({ hq, shadows, shadowMap, onDone }: { hq: PublicHqProjection; shadows: boolean; shadowMap: number; onDone: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useMemo(() => new THREE.Scene(), []);
  const camera = useMemo(() => new THREE.PerspectiveCamera(40, 1.6, 0.5, 250), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(0.1, 0.1, 0.1), []);
  const materials = useMemo(() => {
    const textures = hqTextures(hq);
    const sample = textures[0] ?? null;
    return [
      ...Object.values(hqMaterials()).filter(isMaterial),
      ...Object.values(hqBrandMaterials(hq.organization.logoColor)).filter(isMaterial),
      // the office's own textured surfaces (screens, prints) via its material factories
      ...(sample ? [screenMat(sample, false), screenMat(sample, true), printMat(sample)] : []),
      ...(sample ? [plainMapped(sample)] : []),
    ];
  }, [hq]);

  useEffect(() => {
    let cancelled = false;
    // compile after the portal's lights and meshes are attached
    const id = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera)
        .catch(() => undefined)
        .then(() => {
          if (!cancelled) onDone();
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(
    () => () => {
      geometry.dispose();
      // only the plain textured stand-in is ours; the rest are the office's shared materials
      materials.filter((m) => m.userData.warmupOnly).forEach((m) => m.dispose());
    },
    [geometry, materials],
  );

  return createPortal(
    <>
      <HqLights shadows={shadows} shadowMap={shadowMap} />
      {materials.map((m, i) => (
        <mesh key={m.uuid} geometry={geometry} material={m} position={[(i % 10) * 0.2, 0, Math.floor(i / 10) * 0.2]} castShadow receiveShadow />
      ))}
    </>,
    scene,
  );
}
