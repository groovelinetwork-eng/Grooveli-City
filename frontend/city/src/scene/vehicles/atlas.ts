import * as THREE from 'three';

/**
 * Vehicle decal atlas: one small canvas texture shared by every vehicle.
 * The top-left block is opaque white; all non-decal faces sample it, so a
 * single material (map × vertex colour) covers bodies and liveries alike.
 * Artwork is Grooveli's own branding and generic markings — no third-party logos.
 */
export const ATLAS_SIZE = { w: 1024, h: 512 } as const;

type Px = readonly [x: number, y: number, w: number, h: number];

export const DECAL_PX = {
  white: [0, 0, 64, 64],
  vanLogo: [64, 0, 512, 128],
  vanStripes: [576, 0, 448, 128],
  busSwoosh: [0, 128, 512, 128],
  busText: [512, 128, 512, 64],
  busSign: [512, 192, 512, 64],
  service: [0, 256, 512, 96],
  chevrons: [512, 256, 512, 96],
  taxi: [0, 384, 256, 96],
  checker: [256, 384, 512, 64],
} as const satisfies Record<string, Px>;

export type DecalName = keyof typeof DECAL_PX;

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Canvas pixel rect → texture UVs (CanvasTexture uses flipY, so v runs bottom-up). */
export function decalUV(name: DecalName): UVRect {
  const [x, y, w, h] = DECAL_PX[name];
  return { u0: x / ATLAS_SIZE.w, u1: (x + w) / ATLAS_SIZE.w, v0: 1 - (y + h) / ATLAS_SIZE.h, v1: 1 - y / ATLAS_SIZE.h };
}

/** UV inside the opaque white block, used by every non-decal face. */
export const WHITE_UV: readonly [number, number] = [32 / ATLAS_SIZE.w, 1 - 32 / ATLAS_SIZE.h];

const PURPLE = '#6d3fe0';
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

function gLogo(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const grd = g.createLinearGradient(x, y, x + size, y + size);
  grd.addColorStop(0, '#22d3ee');
  grd.addColorStop(0.5, '#3b82f6');
  grd.addColorStop(1, '#8b5cf6');
  g.fillStyle = grd;
  g.font = `900 ${size}px ${FONT}`;
  g.textBaseline = 'middle';
  g.fillText('G', x, y + size / 2);
}

/** Draws the atlas (browser only). */
export function createVehicleAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS_SIZE.w;
  c.height = ATLAS_SIZE.h;
  const g = c.getContext('2d')!;
  const at = (name: DecalName, draw: (w: number, h: number) => void) => {
    const [x, y, w, h] = DECAL_PX[name];
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    draw(w, h);
    g.restore();
  };

  at('white', (w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
  });

  // Van: "G Grooveli" wordmark
  at('vanLogo', (_w, h) => {
    gLogo(g, 14, 10, h - 24);
    g.fillStyle = PURPLE;
    g.font = `800 ${Math.round(h * 0.62)}px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText('Grooveli', 118, h / 2 + 4);
  });

  // Van: rising purple stripes toward the rear (u grows rearward)
  at('vanStripes', (w, h) => {
    const cols = [PURPLE, '#8b5cf6', '#a78bfa'];
    cols.forEach((col, i) => {
      g.fillStyle = col;
      const x0 = 40 + i * 120;
      g.beginPath();
      g.moveTo(x0, h);
      g.lineTo(x0 + 70, h);
      g.lineTo(x0 + 200, 0);
      g.lineTo(x0 + 130, 0);
      g.closePath();
      g.fill();
    });
    g.fillStyle = PURPLE;
    g.fillRect(400, 0, w - 400, h);
  });

  // Bus: purple swoosh over the rear of the blue body
  at('busSwoosh', (w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#7c3aed');
    grd.addColorStop(1, '#5b21b6');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, h);
    g.bezierCurveTo(w * 0.25, h, w * 0.35, 0, w * 0.6, 0);
    g.lineTo(w, 0);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  });

  at('busText', (_w, h) => {
    gLogo(g, 8, 4, h - 8);
    g.fillStyle = '#ffffff';
    g.font = `800 ${Math.round(h * 0.6)}px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText('Grooveli City', 70, h / 2 + 2);
  });

  // Bus destination display (amber LED text on black; glows at night)
  at('busSign', (w, h) => {
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb020';
    g.font = `800 ${Math.round(h * 0.62)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('GROOVELI CITY', w / 2, h / 2 + 2);
    g.textAlign = 'left';
  });

  at('service', (_w, h) => {
    g.fillStyle = '#1e293b';
    g.font = `800 ${Math.round(h * 0.5)}px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText('City Services', 12, h * 0.42);
    g.fillStyle = '#f97316';
    g.fillRect(12, h * 0.78, 380, h * 0.12);
  });

  // Orange / white safety chevrons
  at('chevrons', (w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f97316';
    for (let x = -h; x < w + h; x += 64) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 32, h);
      g.lineTo(x + 32 + h, 0);
      g.lineTo(x + h, 0);
      g.closePath();
      g.fill();
    }
  });

  at('taxi', (w, h) => {
    g.fillStyle = '#fde047';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#111827';
    g.font = `900 ${Math.round(h * 0.72)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TAXI', w / 2, h / 2 + 4);
    g.textAlign = 'left';
  });

  // Two-row checker band; empty cells stay transparent so the paint shows through
  at('checker', (w, h) => {
    const s = h / 2;
    g.fillStyle = '#111827';
    for (let col = 0; col < w / s; col++) for (let row = 0; row < 2; row++) if ((col + row) % 2 === 0) g.fillRect(col * s, row * s, s, s);
  });

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
