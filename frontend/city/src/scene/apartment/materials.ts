import * as THREE from 'three';

/**
 * Procedural PBR-style materials for the apartment. Each canvas map is drawn
 * once and cached; colour maps double as bump maps for surface relief.
 */
const cache = new Map<string, THREE.CanvasTexture>();
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function tint(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

/** Warm oak planks: 8 boards per tile, staggered butt joints, grain streaks. */
export function plankTexture() {
  return canvasTexture('planks', 1024, 1024, (g) => {
    seed = 42;
    const boards = 8;
    const bw = 1024 / boards;
    for (let i = 0; i < boards; i++) {
      const offset = rnd() * 1024;
      for (const start of [offset - 1024, offset]) {
        const base = tint('#bd7d4a', (rnd() - 0.5) * 0.1);
        g.fillStyle = base;
        g.fillRect(i * bw, start, bw, 1024);
        // grain
        for (let k = 0; k < 26; k++) {
          g.strokeStyle = `rgba(${rnd() > 0.5 ? '90,45,18' : '214,150,96'},${0.08 + rnd() * 0.14})`;
          g.lineWidth = 1 + rnd() * 2;
          const x = i * bw + rnd() * bw;
          g.beginPath();
          g.moveTo(x, start);
          for (let y = start; y < start + 1024; y += 64) g.lineTo(x + Math.sin(y * 0.01 + k) * 3, y);
          g.stroke();
        }
        // butt joint
        g.fillStyle = 'rgba(60,30,12,0.75)';
        g.fillRect(i * bw, start, bw, 3);
      }
      g.fillStyle = 'rgba(55,28,10,0.85)';
      g.fillRect(i * bw, 0, 3, 1024);
    }
  });
}

/** Ochre plaster with soft mottling. */
export function plasterTexture() {
  return canvasTexture('plaster', 512, 512, (g) => {
    seed = 7;
    g.fillStyle = '#ebb553';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? '255,226,160' : '170,110,40'},${rnd() * 0.08})`;
      const r = 2 + rnd() * 10;
      g.beginPath();
      g.arc(rnd() * 512, rnd() * 512, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Neutral upholstery weave; tinted by material colour. */
export function fabricTexture() {
  return canvasTexture('fabric', 256, 256, (g) => {
    seed = 3;
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 4) {
      g.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.08})`;
      g.fillRect(0, y, 256, 2);
    }
    for (let x = 0; x < 256; x += 4) {
      g.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.06})`;
      g.fillRect(x, 0, 2, 256);
    }
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
  });
}

/** Light wood (desk, side tables). */
export function lightWoodTexture() {
  return canvasTexture('lightwood', 512, 512, (g) => {
    seed = 19;
    g.fillStyle = '#e2b98a';
    g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 60; k++) {
      g.strokeStyle = `rgba(150,95,50,${0.05 + rnd() * 0.12})`;
      g.lineWidth = 1 + rnd() * 2;
      const y = rnd() * 512;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 4);
      g.stroke();
    }
  });
}

/** Dark stained wood (headboard, door, wall cap). */
export function darkWoodTexture() {
  return canvasTexture('darkwood', 512, 512, (g) => {
    seed = 23;
    g.fillStyle = '#4a2a17';
    g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 70; k++) {
      g.strokeStyle = `rgba(${rnd() > 0.5 ? '30,14,6' : '110,62,34'},${0.15 + rnd() * 0.2})`;
      g.lineWidth = 1 + rnd() * 2.5;
      const x = rnd() * 512;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y * 0.015 + k) * 5, y);
      g.stroke();
    }
  });
}

/** Cobblestone paving around the house. */
export function cobbleTexture() {
  return canvasTexture('cobble', 512, 512, (g) => {
    seed = 31;
    g.fillStyle = '#8a7660';
    g.fillRect(0, 0, 512, 512);
    const s = 32;
    for (let y = 0; y < 512; y += s)
      for (let x = (y / s) % 2 ? -s / 2 : 0; x < 512; x += s) {
        g.fillStyle = tint('#bfa688', (rnd() - 0.5) * 0.12);
        g.beginPath();
        g.roundRect(x + 2, y + 2, s - 4, s - 4, 6);
        g.fill();
      }
  });
}

/** Grass ground. */
export function grassTexture() {
  return canvasTexture('grass', 512, 512, (g) => {
    seed = 37;
    g.fillStyle = '#9da55a';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? '120,135,60' : '178,182,104'},${0.25 + rnd() * 0.3})`;
      g.fillRect(rnd() * 512, rnd() * 512, 2, 3);
    }
  });
}

/** Dusk sky: violet top → warm peach bottom-right (screen-space background). */
export function skyTexture() {
  const t = canvasTexture('sky', 64, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#6d6aa8');
    grd.addColorStop(0.45, '#a586a7');
    grd.addColorStop(1, '#efa58a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 512);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function repeated(t: THREE.Texture, x: number, y: number) {
  const c = t.clone();
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}

/** Floor planks run along +X (reference: top-left → bottom-right on screen). */
function planks() {
  const t = repeated(plankTexture(), 2.2, 2.2);
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI / 2;
  return t;
}

/** Shared material set (one instance per scene mount). */
export function makeApartmentMaterials() {
  const fabric = fabricTexture();
  const fab = (color: string) => new THREE.MeshStandardMaterial({ color, map: fabric, bumpMap: fabric, bumpScale: 0.6, roughness: 0.95 });
  const lw = lightWoodTexture();
  const dw = darkWoodTexture();
  return {
    floor: new THREE.MeshStandardMaterial({ map: planks(), bumpMap: planks(), bumpScale: 0.8, roughness: 0.55, metalness: 0.02 }),
    wall: new THREE.MeshStandardMaterial({ map: repeated(plasterTexture(), 2, 1), roughness: 0.92 }),
    wallEdge: new THREE.MeshStandardMaterial({ color: '#f1e4c8', roughness: 0.8 }),
    trim: new THREE.MeshStandardMaterial({ color: '#efe2c4', roughness: 0.7 }),
    cap: new THREE.MeshStandardMaterial({ map: dw, color: '#5a3520', roughness: 0.6 }),
    darkWood: new THREE.MeshStandardMaterial({ map: dw, roughness: 0.55 }),
    lightWood: new THREE.MeshStandardMaterial({ map: lw, roughness: 0.6 }),
    greenFabric: fab('#1f4a2c'),
    brownFabric: fab('#8a3a1c'),
    purpleFabric: fab('#4a1e45'),
    pinkFabric: fab('#e98b7a'),
    linen: fab('#efe3cf'),
    redPaint: new THREE.MeshStandardMaterial({ color: '#d42a2a', roughness: 0.45 }),
    whitePlastic: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.35 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#efe6da', roughness: 0.18, metalness: 0.02 }),
    bluePlastic: new THREE.MeshStandardMaterial({ color: '#1f5fb8', roughness: 0.38 }),
    navyPlastic: new THREE.MeshStandardMaterial({ color: '#16408f', roughness: 0.4 }),
    yellowPlastic: new THREE.MeshStandardMaterial({ color: '#f2c12e', roughness: 0.42 }),
    redPlastic: new THREE.MeshStandardMaterial({ color: '#e0242c', roughness: 0.4 }),
    tealPlastic: new THREE.MeshStandardMaterial({ color: '#2c88b8', roughness: 0.4 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: '#1d1d22', roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b8bcc4', roughness: 0.35, metalness: 0.85 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.45, metalness: 0.7 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.3, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#e8f2f6', roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.55, thickness: 0.02 }),
    screen: new THREE.MeshStandardMaterial({ color: '#203040', emissive: '#7fb2d8', emissiveIntensity: 0.35, roughness: 0.2 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#4d7a2c', roughness: 0.8, side: THREE.DoubleSide }),
    soil: new THREE.MeshStandardMaterial({ color: '#3b2516', roughness: 1 }),
    terracotta: new THREE.MeshStandardMaterial({ color: '#59544e', roughness: 0.8 }),
    bulb: new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd58a', emissiveIntensity: 2.2, toneMapped: false }),
    cobble: new THREE.MeshStandardMaterial({ map: repeated(cobbleTexture(), 4, 4), roughness: 0.95 }),
    grass: new THREE.MeshStandardMaterial({ map: repeated(grassTexture(), 10, 10), roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#a4795a', roughness: 0.95 }),
    sign: new THREE.MeshStandardMaterial({ color: '#173a8c', roughness: 0.4 }),
    blind: new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.7 }),
  };
}

export type ApartmentMaterials = ReturnType<typeof makeApartmentMaterials>;
