import * as THREE from 'three';
import { makeHqMaterials } from '../hq/hqMaterials';

/**
 * AI Career Center palette: the HQ/apartment PBR set (woods, fabrics, glass,
 * metals) extended with slate composite panels, polished resin and dark
 * composite floors, acoustic felt and controlled cyan / blue / violet light.
 */
const cache = new Map<string, THREE.CanvasTexture>();
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** Slate composite wall panels with seams, reveal lines and small vents. */
export function compositeWallTexture() {
  return canvasTexture('ai-wall', 512, 512, (g) => {
    seed = 3;
    g.fillStyle = '#34445f';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 256)
      for (let x = 0; x < 512; x += 128) {
        const grd = g.createLinearGradient(x, y, x + 128, y + 256);
        grd.addColorStop(0, '#3e5070');
        grd.addColorStop(1, '#31405a');
        g.fillStyle = grd;
        g.fillRect(x + 3, y + 3, 122, 250);
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(x + 3, y + 3, 122, 2);
      }
    g.fillStyle = 'rgba(10,16,30,0.6)';
    for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 3, 512);
    for (let y = 0; y < 512; y += 256) g.fillRect(0, y, 512, 3);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(10,16,30,0.45)';
      g.fillRect(40 + (i % 2) * 256, 200 + Math.floor(i / 2) * 18, 48, 4);
    }
  });
}

/** Polished light resin with large tile grid (main hall). */
export function resinTexture() {
  return canvasTexture('ai-resin', 1024, 1024, (g) => {
    seed = 9;
    g.fillStyle = '#d7dee8';
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '150,165,190'},${0.03 + rnd() * 0.04})`;
      g.beginPath();
      g.ellipse(rnd() * 1024, rnd() * 1024, 80 + rnd() * 200, 30 + rnd() * 80, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(110,125,150,0.55)';
    g.lineWidth = 3;
    for (let k = 0; k <= 1024; k += 512) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, 1024);
      g.moveTo(0, k);
      g.lineTo(1024, k);
      g.stroke();
    }
  });
}

/** Dark composite floor with a faint cyan technical grid (lab, pathway, alcove). */
export function compositeFloorTexture() {
  return canvasTexture('ai-floor-dark', 512, 512, (g) => {
    seed = 21;
    g.fillStyle = '#2a3550';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.035})`;
      g.fillRect(rnd() * 512, rnd() * 512, 2, 2);
    }
    g.strokeStyle = 'rgba(34,211,238,0.22)';
    g.lineWidth = 2;
    for (let k = 0; k <= 512; k += 128) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, 512);
      g.moveTo(0, k);
      g.lineTo(512, k);
      g.stroke();
    }
    g.fillStyle = 'rgba(34,211,238,0.5)';
    for (let x = 0; x <= 512; x += 128) for (let y = 0; y <= 512; y += 128) g.fillRect(x - 3, y - 3, 6, 6);
  });
}

/** Grooved acoustic felt (interview chamber). */
export function acousticTexture() {
  return canvasTexture('ai-acoustic', 256, 256, (g) => {
    g.fillStyle = '#4a3f70';
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      g.fillStyle = 'rgba(15,10,30,0.45)';
      g.fillRect(x, 0, 4, 256);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 4, 0, 2, 256);
    }
  });
}

/** Perforated server-rack door. */
export function rackTexture() {
  return canvasTexture('ai-rack', 256, 512, (g) => {
    g.fillStyle = '#1b2233';
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = '#0b0f19';
    for (let y = 12; y < 500; y += 10) for (let x = 14; x < 244; x += 10) g.fillRect(x, y, 5, 5);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, 0, 256, 6);
  }, false);
}

/** Soft radial glow for additive halos. */
export function glowTexture() {
  return canvasTexture('ai-glow', 128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }, false);
}

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const glow = (color: string, intensity = 2) => std({ color, emissive: color, emissiveIntensity: intensity, toneMapped: false });
const holo = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

export function makeAiMaterials() {
  const base = makeHqMaterials();
  return {
    ...base,
    aiWall: std({ map: compositeWallTexture(), roughness: 0.55, metalness: 0.15 }),
    resin: std({ map: resinTexture(), roughness: 0.18, metalness: 0.05 }),
    compositeFloor: std({ map: compositeFloorTexture(), roughness: 0.4, metalness: 0.1 }),
    aiCarpet: std({ map: base.carpet.map!, color: '#9aa8d8', roughness: 1 }),
    acoustic: std({ map: acousticTexture(), roughness: 1 }),
    slate: std({ color: '#26324a', roughness: 0.45, metalness: 0.25 }),
    navy: std({ color: '#1a2238', roughness: 0.5, metalness: 0.2 }),
    whiteComposite: std({ color: '#eef2f7', roughness: 0.28, metalness: 0.05 }),
    brushed: std({ color: '#aab3c0', roughness: 0.32, metalness: 0.9 }),
    rack: std({ map: rackTexture(), roughness: 0.5, metalness: 0.4 }),
    violetFabric: std({ color: '#5b4a9e', map: base.navyFabric.map!, roughness: 0.95 }),
    tealFelt: std({ color: '#1f6f7a', map: base.navyFabric.map!, roughness: 0.95 }),
    cyanGlow: glow('#22d3ee', 2.2),
    blueGlow: glow('#3b82f6', 2),
    violetGlow: glow('#a78bfa', 2),
    softCyan: glow('#67e8f9', 0.9),
    holoCyan: holo('#22d3ee', 0.35),
    holoViolet: holo('#a78bfa', 0.3),
    holoFaint: holo('#38bdf8', 0.06),
    halo: new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#22d3ee', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
}

export type AiMaterials = ReturnType<typeof makeAiMaterials>;
