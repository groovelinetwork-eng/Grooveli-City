import * as THREE from 'three';
import { fabricTexture, makeApartmentMaterials, plankTexture, repeated } from '../apartment/materials';

/**
 * HQ material set: the apartment's PBR palette (woods, fabrics, plastics,
 * metals) extended with office finishes — carpet tiles, stone, terrazzo,
 * warm-neutral plaster, glass, aluminium and brand accents.
 */
const cache = new Map<string, THREE.CanvasTexture>();
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function shade(hex: string, l: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, l);
  return `#${c.getHexString()}`;
}

/** Charcoal-blue carpet tiles laid in quarter turns. */
export function carpetTexture() {
  return canvasTexture('carpet', 512, 512, (g) => {
    seed = 11;
    const s = 128;
    for (let y = 0; y < 512; y += s)
      for (let x = 0; x < 512; x += s) {
        const turn = ((x + y) / s) % 2;
        g.fillStyle = shade('#4a5366', (rnd() - 0.5) * 0.03);
        g.fillRect(x, y, s, s);
        for (let k = 0; k < 22; k++) {
          g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '10,14,24'},0.05)`;
          if (turn) g.fillRect(x, y + k * 6 + rnd() * 3, s, 2);
          else g.fillRect(x + k * 6 + rnd() * 3, y, 2, s);
        }
        g.strokeStyle = 'rgba(20,24,34,0.35)';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, s - 2, s - 2);
      }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? '160,170,190' : '20,22,30'},${rnd() * 0.12})`;
      g.fillRect(rnd() * 512, rnd() * 512, 1.5, 1.5);
    }
  });
}

/** Large-format warm limestone tiles with soft veining (lobby). */
export function stoneTexture() {
  return canvasTexture('stone', 1024, 1024, (g) => {
    seed = 5;
    const s = 512;
    for (let y = 0; y < 1024; y += s)
      for (let x = 0; x < 1024; x += s) {
        g.fillStyle = shade('#e9e0d1', (rnd() - 0.5) * 0.04);
        g.fillRect(x, y, s, s);
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = `rgba(150,130,105,${0.05 + rnd() * 0.07})`;
          g.lineWidth = 1 + rnd() * 2;
          g.beginPath();
          let px = x + rnd() * s;
          let py = y;
          g.moveTo(px, py);
          while (py < y + s) {
            px += (rnd() - 0.5) * 40;
            py += 20 + rnd() * 30;
            g.lineTo(px, py);
          }
          g.stroke();
        }
        g.strokeStyle = 'rgba(120,108,92,0.55)';
        g.lineWidth = 3;
        g.strokeRect(x, y, s, s);
      }
  });
}

/** Cream terrazzo (lounge / kitchenette). */
export function terrazzoTexture() {
  return canvasTexture('terrazzo', 512, 512, (g) => {
    seed = 13;
    g.fillStyle = '#eadfce';
    g.fillRect(0, 0, 512, 512);
    const chips = ['#c9a47a', '#8f8a80', '#b9653f', '#6d6a8f', '#ffffff', '#d7c3a0'];
    for (let i = 0; i < 900; i++) {
      g.fillStyle = chips[Math.floor(rnd() * chips.length)]!;
      g.beginPath();
      const x = rnd() * 512;
      const y = rnd() * 512;
      const r = 1.5 + rnd() * 4.5;
      g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Warm-neutral plaster for office walls. */
export function officePlasterTexture() {
  return canvasTexture('office-plaster', 512, 512, (g) => {
    seed = 17;
    g.fillStyle = '#efe6d7';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? '255,250,238' : '190,170,140'},${rnd() * 0.06})`;
      g.beginPath();
      g.arc(rnd() * 512, rnd() * 512, 2 + rnd() * 9, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Vertical oak slats (reception backdrop, culture wall, careers wall). */
export function slatTexture() {
  return canvasTexture('slats', 512, 512, (g) => {
    seed = 29;
    const n = 16;
    const w = 512 / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade('#c8955f', (rnd() - 0.5) * 0.08);
      g.fillRect(i * w, 0, w, 512);
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = `rgba(120,70,30,${0.06 + rnd() * 0.08})`;
        g.lineWidth = 1;
        const x = i * w + 3 + rnd() * (w - 6);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + (rnd() - 0.5) * 4, 512);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,22,10,0.8)';
      g.fillRect(i * w + w - 5, 0, 5, 512);
    }
  });
}

/** Pale daylight sky (screen-space background). */
export function daySkyTexture() {
  const t = canvasTexture('day-sky', 64, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#9fc4e6');
    grd.addColorStop(0.55, '#d7e6f0');
    grd.addColorStop(1, '#f6e7d4');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 512);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Concrete pavers outside the building. */
export function paverTexture() {
  return canvasTexture('pavers', 512, 512, (g) => {
    seed = 41;
    g.fillStyle = '#9b958c';
    g.fillRect(0, 0, 512, 512);
    const w = 128;
    const h = 64;
    for (let y = 0; y < 512; y += h)
      for (let x = (y / h) % 2 ? -w / 2 : 0; x < 512; x += w) {
        g.fillStyle = shade('#cfc8bc', (rnd() - 0.5) * 0.06);
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
      }
  });
}

function planks(repeat: number) {
  const t = repeated(plankTexture(), repeat, repeat);
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI / 2;
  return t;
}

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);

export function makeHqMaterials() {
  const base = makeApartmentMaterials();
  const fabric = fabricTexture();
  const fab = (color: string) => std({ color, map: fabric, bumpMap: fabric, bumpScale: 0.5, roughness: 0.95 });
  const glass = std({ color: '#d4ebf2', transparent: true, opacity: 0.17, roughness: 0.04, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide });
  return {
    ...base,
    // floors (world-scale repeats are set per zone)
    woodFloor: std({ map: planks(1), color: '#f6e2cb', roughness: 0.5 }),
    walnutFloor: std({ map: planks(1), color: '#a9785a', roughness: 0.45 }),
    carpet: std({ map: carpetTexture(), roughness: 1 }),
    stone: std({ map: stoneTexture(), roughness: 0.32, metalness: 0.02 }),
    terrazzo: std({ map: terrazzoTexture(), roughness: 0.35 }),
    pavers: std({ map: repeated(paverTexture(), 6, 6), roughness: 0.95 }),
    // architecture
    officeWall: std({ map: repeated(officePlasterTexture(), 3, 1), roughness: 0.92 }),
    charcoal: std({ color: '#2a2c31', roughness: 0.55 }),
    aluminium: std({ color: '#8e949c', roughness: 0.3, metalness: 0.85 }),
    darkFrame: std({ color: '#33363d', roughness: 0.4, metalness: 0.6 }),
    glassPane: glass,
    frosted: std({ color: '#f2f6f7', transparent: true, opacity: 0.62, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide }),
    slats: std({ map: slatTexture(), roughness: 0.6 }),
    stoneTop: std({ color: '#ece7df', roughness: 0.25 }),
    marble: std({ color: '#f4f1ec', roughness: 0.18 }),
    deskWhite: std({ color: '#f1efea', roughness: 0.4 }),
    stainless: std({ color: '#c9ccd1', roughness: 0.28, metalness: 0.9 }),
    leather: std({ color: '#3b2a22', roughness: 0.45 }),
    cork: std({ color: '#b98b5a', roughness: 0.95 }),
    // upholstery
    navyFabric: fab('#2a3a66'),
    charcoalFabric: fab('#43464f'),
    mustardFabric: fab('#d39b2c'),
    tealFabric: fab('#2a7d7a'),
    plumFabric: fab('#5d2f66'),
    greyFabric: fab('#9ca1ab'),
    sandFabric: fab('#d6c3a0'),
    terracottaFabric: fab('#b65a3c'),
    blueFabric: fab('#2f5fb8'),
    // Grooveli accents
    purple: std({ color: '#6a45d1', roughness: 0.45 }),
    blue: std({ color: '#2f6fd6', roughness: 0.45 }),
    lightPanel: std({ color: '#fff7e8', emissive: '#fff1d4', emissiveIntensity: 1.6, toneMapped: false }),
    led: std({ color: '#c4b5fd', emissive: '#a78bfa', emissiveIntensity: 1.8, toneMapped: false }),
    ledGreen: std({ color: '#86efac', emissive: '#22c55e', emissiveIntensity: 1.8, toneMapped: false }),
    daylight: std({ color: '#e6f1f8', emissive: '#eaf4ff', emissiveIntensity: 0.65, roughness: 0.1 }),
    tree: std({ color: '#5f8f3a', roughness: 0.85 }),
    bark: std({ color: '#5a3f2b', roughness: 0.9 }),
    grassLawn: std({ map: repeated(base.grass.map!, 14, 14), color: '#d4ecae', roughness: 1 }),
  };
}

export type HqMaterials = ReturnType<typeof makeHqMaterials>;

/** Brand material set derived from the organisation's logo colour. */
export function brandMaterials(color: string) {
  return {
    brand: std({ color, roughness: 0.4 }),
    brandGlow: std({ color, emissive: color, emissiveIntensity: 1.2, toneMapped: false }),
    brandFabric: std({ color: shade(color, -0.08), map: fabricTexture(), roughness: 0.95 }),
  };
}
