import * as THREE from 'three';

/**
 * Procedural canvas textures for the reconstructed city. Each is drawn once and
 * cached by key; meshes clone (sharing the image) to set per-face repeats.
 */
const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: boolean; nearest?: boolean } = {}) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.nearest) t.magFilter = THREE.NearestFilter;
  cache.set(key, t);
  return t;
}

/** Clone sharing the image, with its own repeat. */
export function repeatOf(t: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const c = t.clone();
  c.repeat.set(Math.max(0.5, rx), Math.max(0.5, ry));
  c.needsUpdate = true;
  return c;
}

let seedState = 1;
function rnd() {
  seedState = (seedState * 16807) % 2147483647;
  return seedState / 2147483647;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  if (amt >= 0) c.lerp(new THREE.Color('#ffffff'), amt);
  else c.lerp(new THREE.Color('#000000'), -amt);
  return `#${c.getHexString()}`;
}


export type WindowLayout = 'curtain' | 'ribbon' | 'punched' | 'store';

function tag(kind: WindowLayout, t: THREE.CanvasTexture) {
  t.userData.windows = kind;
  return t;
}

/** Window rectangle inside one façade tile (fractions; canvas y down), per layout. */
const WINDOW_RECT: Record<Exclude<WindowLayout, 'store'>, [number, number, number, number]> = {
  curtain: [0.06, 0.06, 0.94, 0.76],
  ribbon: [0.03, 0.22, 0.97, 0.72],
  punched: [0.19, 0.21, 0.81, 0.75],
};
const LIGHT_TONES = ['#ffd98a', '#ffe7b0', '#fff2d2', '#ffcf7a', '#fde3a7', '#d9ecff', '#ffe0a0'];

/**
 * Night window lights: an 8 × 8 grid of windows, each lit (~70 %) or dark,
 * in varied warm and a few cool tones. Used as the emissive map at 1/8 of the
 * façade repeat, so every cell lands exactly on one real window.
 */
export function windowLights(kind: Exclude<WindowLayout, 'store'>, variant: number) {
  const v = Math.abs(variant) % 4;
  return make(`lights:${kind}:${v}`, 256, 256, (g, w, h) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, h);
    seedState = 977 + v * 131 + kind.length * 17;
    const N = 8;
    const cw = w / N;
    const ch = h / N;
    const [x0, y0, x1, y1] = WINDOW_RECT[kind];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        if (rnd() > 0.66) continue;
        const tone = LIGHT_TONES[Math.floor(rnd() * LIGHT_TONES.length)]!;
        const dim = 0.7 + rnd() * 0.3;
        g.globalAlpha = dim;
        g.fillStyle = tone;
        g.fillRect(c * cw + x0 * cw, r * ch + y0 * ch, (x1 - x0) * cw, (y1 - y0) * ch);
        // a blind or a person in some windows
        if (rnd() > 0.75) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(c * cw + x0 * cw, r * ch + y0 * ch, (x1 - x0) * cw, (y1 - y0) * ch * 0.3);
        }
        g.globalAlpha = 1;
      }
  });
}

/**
 * Emissive map for a façade face at night: lit interiors for storefronts,
 * otherwise a per-building window-light pattern aligned to the tile grid.
 */
export function nightEmissive(tile: THREE.Texture, rx: number, ry: number, seed: number): THREE.Texture {
  const kind = tile.userData.windows as WindowLayout | undefined;
  if (!kind || kind === 'store') return repeatOf(tile, rx, ry);
  const t = windowLights(kind, seed).clone();
  t.repeat.set(rx / 8, ry / 8);
  t.offset.set((Math.abs(seed) % 8) / 8, (Math.abs(seed * 3) % 8) / 8);
  t.needsUpdate = true;
  return t;
}

/** One floor × one bay of glass curtain wall with a light spandrel band. */
export function curtainTile(accent: string, night: boolean) {
  return tag('curtain', make(`curtain:${accent}:${night}`, 128, 128, (g, w, h) => {
    const glassTop = night ? '#0d1b36' : shade(accent, 0.55);
    const glassBot = night ? '#14284d' : shade(accent, 0.25);
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, glassTop);
    grd.addColorStop(0.55, glassBot);
    grd.addColorStop(1, night ? '#0b1630' : shade(accent, 0.45));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // sky reflection streak
    if (!night) {
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.beginPath();
      g.moveTo(w * 0.15, 0);
      g.lineTo(w * 0.45, 0);
      g.lineTo(w * 0.2, h * 0.78);
      g.lineTo(0, h * 0.78);
      g.fill();
    }
    // spandrel
    g.fillStyle = night ? '#25324a' : '#f3f6f9';
    g.fillRect(0, h * 0.8, w, h * 0.2);
    // mullions
    g.fillStyle = night ? '#1f2a3d' : '#e8edf3';
    g.fillRect(0, 0, 5, h);
    g.fillRect(w / 2 - 2, 0, 4, h * 0.8);
  }));
}

/** Ribbon window band (hospital / civic). */
export function ribbonTile(body: string, accent: string, night: boolean) {
  return tag('ribbon', make(`ribbon:${body}:${accent}:${night}`, 128, 128, (g, w, h) => {
    g.fillStyle = night ? shade(body, -0.65) : body;
    g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, h * 0.25, 0, h * 0.75);
    grd.addColorStop(0, night ? '#22314f' : shade(accent, 0.45));
    grd.addColorStop(1, night ? '#1a2640' : shade(accent, 0.15));
    g.fillStyle = grd;
    g.fillRect(0, h * 0.22, w, h * 0.5);
    g.fillStyle = night ? '#2a2a2a' : shade(body, -0.12);
    g.fillRect(w / 2 - 2, h * 0.22, 4, h * 0.5);
    g.fillRect(0, h * 0.22, 3, h * 0.5);
  }));
}

/** Punched windows in a solid wall (midrise / residential). */
export function punchedTile(body: string, accent: string, night: boolean, seed: number) {
  return tag('punched', make(`punched:${body}:${accent}:${night}:${seed}`, 128, 128, (g, w, h) => {
    g.fillStyle = night ? shade(body, -0.7) : body;
    g.fillRect(0, 0, w, h);
    const win = night ? '#1b2438' : shade(accent, 0.5);
    g.fillStyle = shade(body, night ? -0.8 : -0.18);
    g.fillRect(w * 0.16, h * 0.18, w * 0.68, h * 0.6);
    g.fillStyle = win;
    g.fillRect(w * 0.19, h * 0.21, w * 0.62, h * 0.54);
    if (!night) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(w * 0.19, h * 0.21, w * 0.2, h * 0.54);
    }
    g.fillStyle = shade(body, night ? -0.6 : -0.08);
    g.fillRect(0, h * 0.92, w, h * 0.08);
  }));
}

/** Ground-floor shopfront: warm lit interiors behind dark mullions, sign band on top. */
export function storefrontTile(accent: string, night: boolean) {
  return tag('store', make(`store:${accent}:${night}`, 128, 128, (g, w, h) => {
    g.fillStyle = '#2b3442';
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, w, h * 0.16);
    const grd = g.createLinearGradient(0, h * 0.2, 0, h);
    grd.addColorStop(0, night ? '#ffe2a8' : '#ffe6b5');
    grd.addColorStop(1, night ? '#f6a945' : '#f2b766');
    g.fillStyle = grd;
    g.fillRect(4, h * 0.22, w - 8, h * 0.74);
    // interior silhouettes (shelves / people)
    g.fillStyle = 'rgba(120,72,30,0.35)';
    for (let i = 0; i < 4; i++) g.fillRect(10 + i * 30, h * 0.6, 16, h * 0.36);
    g.fillStyle = '#2b3442';
    g.fillRect(w / 2 - 3, h * 0.22, 6, h * 0.78);
  }));
}

/** Warm-grey sidewalk pavers, 2 m tile. */
export function paverTexture(night: boolean) {
  return make(`paver:${night}`, 128, 128, (g, w, h) => {
    g.fillStyle = night ? '#3b4252' : '#c9c1b2';
    g.fillRect(0, 0, w, h);
    seedState = 5;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const v = rnd() * 0.06 - 0.03;
        g.fillStyle = shade(night ? '#3b4252' : '#c9c1b2', v);
        g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
      }
    g.strokeStyle = night ? '#2c3240' : '#b3aa99';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 32, 0);
      g.lineTo(i * 32, h);
      g.moveTo(0, i * 32);
      g.lineTo(w, i * 32);
      g.stroke();
    }
  });
}

/** Slate-blue plaza tiles with soft grout, 4 m tile. */
export function plazaTileTexture(night: boolean) {
  return make(`plaza:${night}`, 256, 256, (g, w, h) => {
    const base = night ? '#24324d' : '#6a84b0';
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    seedState = 11;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        g.fillStyle = shade(base, rnd() * 0.05 - 0.02);
        g.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
      }
    g.strokeStyle = night ? '#33476b' : '#8299c0';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, h);
      g.moveTo(0, i * 64);
      g.lineTo(w, i * 64);
      g.stroke();
    }
  });
}

/** Subtle asphalt grain. */
export function asphaltTexture(night: boolean) {
  return make(`asphalt:${night}`, 128, 128, (g, w, h) => {
    const base = night ? '#1b2234' : '#5f6878';
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    seedState = 3;
    for (let i = 0; i < 900; i++) {
      g.fillStyle = shade(base, rnd() * 0.12 - 0.06);
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  });
}

/** Rooftop terrace deck (mall). */
export function deckTexture(night: boolean) {
  return make(`deck:${night}`, 128, 128, (g, w, h) => {
    g.fillStyle = night ? '#4a3f35' : '#d8c4a4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = night ? '#3a3129' : '#c3ad8a';
    for (let y = 0; y < h; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
}

// ---------------------------------------------------------------- billboards

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

function boardBackground(g: CanvasRenderingContext2D, w: number, h: number) {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#0b2a6b');
  grd.addColorStop(0.6, '#0d3b91');
  grd.addColorStop(1, '#0a2457');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(125,211,252,0.55)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, w - 6, h - 6);
}

/** Company HQ billboard: logo mark, name, "Build · Innovate · Grow", office illustration. */
export function hqBillboard(name: string) {
  return make(`hqboard:${name}`, 1024, 512, (g, w, h) => {
    boardBackground(g, w, h);
    // logo triangle
    g.strokeStyle = '#7dd3fc';
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(70, 120);
    g.lineTo(110, 50);
    g.lineTo(150, 120);
    g.closePath();
    g.stroke();
    g.fillStyle = '#e0f2fe';
    g.font = `700 64px ${FONT}`;
    g.fillText(name, 175, 115);
    g.font = `600 58px ${FONT}`;
    g.fillStyle = '#f8fafc';
    ['Build', 'Innovate', 'Grow'].forEach((t, i) => g.fillText(t, 70, 235 + i * 72));
    // illustration: two people at a desk with a monitor
    g.fillStyle = '#1e40af';
    roundRect(g, 520, 150, 420, 300, 24);
    g.fill();
    g.fillStyle = '#38bdf8';
    roundRect(g, 640, 190, 180, 110, 10);
    g.fill();
    g.fillStyle = '#0f172a';
    g.fillRect(560, 360, 340, 18);
    for (const [x, c] of [
      [600, '#f8fafc'],
      [850, '#1e293b'],
    ] as const) {
      g.fillStyle = '#f1c27d';
      g.beginPath();
      g.arc(x, 250, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = c;
      roundRect(g, x - 42, 285, 84, 80, 18);
      g.fill();
    }
  }, { repeat: false });
}

/** Global markets board with a line chart and fictional tickers (labelled simulated). */
/**
 * Draws the Global Markets board from a BoardModel (data → pixels). Called
 * again on every feed refresh into the same canvas. `null` = loading.
 */
export function drawMarketsBoard(g: CanvasRenderingContext2D, w: number, h: number, m: import('../../services/markets').BoardModel | null) {
  const UP = '#4ade80';
  const DOWN = '#f87171';
  const FLAT = '#cbd5e1';
  const col = (t: 'up' | 'down' | 'flat') => (t === 'up' ? UP : t === 'down' ? DOWN : FLAT);
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#071735';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(56,189,248,0.6)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = '#e2e8f0';
  g.font = `700 40px ${FONT}`;
  g.fillText(m?.title ?? 'GLOBAL MARKETS', 30, 60);
  if (!m) {
    g.fillStyle = '#94a3b8';
    g.font = `600 30px ${FONT}`;
    g.fillText('Loading market data…', 30, 260);
    return;
  }
  // badge
  g.font = `700 22px ${FONT}`;
  const bw = g.measureText(m.badge).width + 28;
  g.fillStyle = m.badge === 'SIMULATED' ? 'rgba(148,163,184,0.25)' : 'rgba(74,222,128,0.2)';
  roundRect(g, w - bw - 24, 30, bw, 36, 18);
  g.fill();
  g.fillStyle = m.badge === 'SIMULATED' ? '#cbd5e1' : UP;
  g.fillText(m.badge, w - bw - 10, 56);
  // chart panel
  const cx = 30;
  const cy = 90;
  const cw = 520;
  const ch = 350;
  g.fillStyle = '#0b2350';
  g.fillRect(cx, cy, cw, ch);
  g.strokeStyle = 'rgba(148,163,184,0.22)';
  g.lineWidth = 2;
  for (let i = 1; i < 5; i++) {
    g.beginPath();
    g.moveTo(cx, cy + (i * ch) / 5);
    g.lineTo(cx + cw, cy + (i * ch) / 5);
    g.stroke();
  }
  if (m.chart) {
    const pad = 28;
    const X = (u: number) => cx + 14 + u * (cw - 28);
    const Y = (v: number) => cy + ch - pad - v * (ch - pad * 2);
    const c = col(m.chart.trend);
    // area under the line
    g.beginPath();
    m.chart.path.forEach(([u, v], k) => (k ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))));
    g.lineTo(X(1), cy + ch);
    g.lineTo(X(0), cy + ch);
    g.closePath();
    g.fillStyle = m.chart.trend === 'down' ? 'rgba(248,113,113,0.14)' : 'rgba(74,222,128,0.14)';
    g.fill();
    g.beginPath();
    m.chart.path.forEach(([u, v], k) => (k ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))));
    g.strokeStyle = c;
    g.lineWidth = 5;
    g.stroke();
    const [lu, lv] = m.chart.path[m.chart.path.length - 1]!;
    g.fillStyle = c;
    g.beginPath();
    g.arc(X(lu), Y(lv), 8, 0, Math.PI * 2);
    g.fill();
    g.font = `600 20px ${FONT}`;
    g.fillStyle = '#94a3b8';
    g.fillText(`H ${m.chart.high}`, cx + 12, cy + 24);
    g.fillText(`L ${m.chart.low}`, cx + 12, cy + ch - 8);
    g.font = `700 26px ${FONT}`;
    g.fillStyle = '#f8fafc';
    const label = `${m.chart.symbol} ${m.chart.last}`;
    g.fillText(label, cx + cw - g.measureText(label).width - 14, cy + 32);
  }
  // quote rows
  m.rows.forEach((r, i) => {
    const y = 132 + i * 86;
    g.fillStyle = '#f8fafc';
    g.font = `700 40px ${FONT}`;
    g.fillText(r.symbol, 590, y);
    g.fillStyle = '#94a3b8';
    g.font = `600 22px ${FONT}`;
    g.fillText(r.price, 590, y + 32);
    g.fillStyle = col(r.trend);
    g.font = `700 34px ${FONT}`;
    const arrow = r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '■';
    const txt = `${r.change} ${arrow}`;
    g.fillText(txt, w - 34 - g.measureText(txt).width, y + 6);
  });
  // footer
  g.fillStyle = '#94a3b8';
  g.font = `500 20px ${FONT}`;
  g.fillText(m.footer.length > 90 ? `${m.footer.slice(0, 89)}…` : m.footer, 30, h - 30);
}

/** Static fallback board (kept for reference; the live board uses drawMarketsBoard). */
export function marketsBoard() {
  return make('markets', 1024, 512, (g, w, h) => {
    g.fillStyle = '#071735';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(56,189,248,0.6)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#e2e8f0';
    g.font = `700 40px ${FONT}`;
    g.fillText('GLOBAL MARKETS', 30, 60);
    g.font = `600 22px ${FONT}`;
    g.fillStyle = '#94a3b8';
    g.fillText('SIMULATED', w - 170, 56);
    // chart panel
    g.fillStyle = '#0b2350';
    g.fillRect(30, 90, 520, 390);
    g.strokeStyle = 'rgba(148,163,184,0.25)';
    g.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(30, 90 + i * 65);
      g.lineTo(550, 90 + i * 65);
      g.stroke();
    }
    seedState = 21;
    g.strokeStyle = '#38bdf8';
    g.lineWidth = 5;
    g.beginPath();
    let y = 400;
    for (let x = 40; x <= 540; x += 20) {
      y = Math.max(120, Math.min(460, y - 12 + rnd() * 26 - 10));
      if (x === 40) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    const rows: [string, string][] = [
      ['GRO', '+2.48%'],
      ['KST', '+1.32%'],
      ['ORB', '+0.87%'],
      ['CPL', '+0.56%'],
    ];
    rows.forEach(([t, v], i) => {
      const yy = 150 + i * 92;
      g.fillStyle = '#f8fafc';
      g.font = `700 44px ${FONT}`;
      g.fillText(t, 600, yy);
      g.fillStyle = '#4ade80';
      g.fillText(v, 760, yy);
      g.beginPath();
      g.moveTo(975, yy - 30);
      g.lineTo(992, yy - 8);
      g.lineTo(958, yy - 8);
      g.fill();
    });
  }, { repeat: false });
}

/** Grooveli brand billboard: "Build Your Career / Live Your Future". */
export function grooveliBillboard() {
  return make('grooveli', 1024, 512, (g, w, h) => {
    boardBackground(g, w, h);
    g.fillStyle = '#38bdf8';
    g.font = `800 150px ${FONT}`;
    g.fillText('G', 70, 210);
    g.fillStyle = '#f8fafc';
    g.font = `700 130px ${FONT}`;
    g.fillText('Grooveli', 200, 205);
    g.font = `600 64px ${FONT}`;
    g.fillStyle = '#e0f2fe';
    g.fillText('Build Your Career', 210, 320);
    g.fillText('Live Your Future', 210, 410);
  }, { repeat: false });
}

/** Rooftop "✚ HOSPITAL" sign. */
export function hospitalSign() {
  return make('hospital', 1024, 192, (g, w, h) => {
    g.fillStyle = '#b91c1c';
    roundRect(g, 0, 0, w, h, 30);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(110, h / 2, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#dc2626';
    g.fillRect(85, h / 2 - 42, 50, 84);
    g.fillRect(68, h / 2 - 25, 84, 50);
    g.fillStyle = '#ffffff';
    g.font = `800 120px ${FONT}`;
    g.fillText('HOSPITAL', 210, 140);
  }, { repeat: false });
}

/** Vertical "CAREERS / JOBS / SKILLS / NETWORK" sign. */
export function careersSign() {
  return make('careers', 512, 1024, (g, w, h) => {
    boardBackground(g, w, h);
    // Grooveli mark
    g.fillStyle = '#7c3aed';
    g.beginPath();
    g.arc(w / 2, 120, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `900 84px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('G', w / 2, 150);
    // stacked words, centred, with accent rules between them
    ['CAREERS', 'JOBS', 'SKILLS', 'NETWORK'].forEach((t, i) => {
      const y = 330 + i * 190;
      g.fillStyle = '#f8fafc';
      g.font = `900 ${t.length >= 7 ? 84 : t.length >= 6 ? 100 : 112}px ${FONT}`;
      g.fillText(t, w / 2, y);
      if (i < 3) {
        g.fillStyle = '#38bdf8';
        g.fillRect(w / 2 - 60, y + 50, 120, 8);
      }
    });
    g.textAlign = 'left';
  }, { repeat: false });
}

/** West-side recruiting billboard. */
export function jobBillboard() {
  return make('jobboard', 640, 1024, (g, w, h) => {
    boardBackground(g, w, h);
    g.fillStyle = '#f8fafc';
    g.font = `800 104px ${FONT}`;
    ['Your Next', 'Job Could', 'Be Here'].forEach((t, i) => g.fillText(t, 40, 200 + i * 125));
    g.font = `600 58px ${FONT}`;
    g.fillStyle = '#bae6fd';
    g.fillText('Explore', 40, 720);
    g.fillText('Opportunities', 40, 790);
    g.fillStyle = '#ffffff';
    roundRect(g, 470, 820, 120, 100, 14);
    g.fill();
    g.fillStyle = '#0d3b91';
    g.fillRect(500, 850, 60, 44);
  }, { repeat: false });
}

/**
 * Landscape rooftop version of the recruiting advert (Halcyon Creative Co.
 * roof): high-contrast two-line headline, call to action and Grooveli Careers
 * branding at standard billboard proportions (≈ 2.7 : 1).
 */
export function jobBillboardWide() {
  return make('jobboard-wide', 2048, 768, (g, w, h) => {
    boardBackground(g, w, h);
    // accent stripe
    g.fillStyle = '#38bdf8';
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#f8fafc';
    g.font = `900 170px ${FONT}`;
    g.fillText('Your Next Job', 90, 240);
    g.fillText('Could Be Here', 90, 425);
    g.fillStyle = '#bae6fd';
    g.font = `800 112px ${FONT}`;
    g.fillText('Explore Opportunities →', 94, 620);
    // briefcase icon panel
    const bx = 1500;
    g.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(g, bx, 120, 440, 380, 40);
    g.fill();
    g.fillStyle = '#ffffff';
    roundRect(g, bx + 90, 230, 260, 190, 26);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 22;
    roundRect(g, bx + 170, 180, 100, 70, 18);
    g.stroke();
    g.fillStyle = '#0d3b91';
    g.fillRect(bx + 90, 300, 260, 16);
    g.fillRect(bx + 200, 285, 40, 46);
    // Grooveli Careers mark
    g.fillStyle = '#7c3aed';
    g.beginPath();
    g.arc(bx + 70, 615, 52, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `900 70px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('G', bx + 70, 640);
    g.textAlign = 'left';
    g.font = `800 60px ${FONT}`;
    g.fillText('Grooveli', bx + 140, 612);
    g.fillStyle = '#bae6fd';
    g.font = `600 40px ${FONT}`;
    g.fillText('Careers', bx + 142, 660);
  }, { repeat: false });
}

/** Rooftop "Today's Top Jobs" screen fed with public vacancy counts. */
export function topJobsBoard(rows: { title: string; count: number }[]) {
  const key = `topjobs:${rows.map((r) => `${r.title}=${r.count}`).join('|')}`;
  return make(key, 1024, 560, (g, w, h) => {
    g.fillStyle = '#0a1f45';
    roundRect(g, 0, 0, w, h, 36);
    g.fill();
    g.strokeStyle = 'rgba(56,189,248,0.8)';
    g.lineWidth = 8;
    roundRect(g, 4, 4, w - 8, h - 8, 32);
    g.stroke();
    g.fillStyle = '#7dd3fc';
    g.font = `700 64px ${FONT}`;
    g.fillText("Today's Top Jobs", 50, 100);
    g.fillText('›', w - 80, 100);
    g.fillStyle = 'rgba(125,211,252,0.35)';
    g.fillRect(50, 135, w - 100, 3);
    rows.slice(0, 3).forEach((r, i) => {
      const y = 230 + i * 110;
      g.fillStyle = '#f8fafc';
      g.font = `600 54px ${FONT}`;
      g.fillText(r.title.length > 22 ? `${r.title.slice(0, 21)}…` : r.title, 50, y);
      g.fillStyle = '#38bdf8';
      g.font = `500 48px ${FONT}`;
      const t = `${r.count} open`;
      g.fillText(t, w - 50 - g.measureText(t).width, y);
    });
  }, { repeat: false });
}

/** Blue street banner with a white "G". */
export function bannerTexture() {
  return make('banner', 128, 320, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#1d4ed8');
    grd.addColorStop(1, '#1e3a8a');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7dd3fc';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffffff';
    g.font = `800 96px ${FONT}`;
    g.fillText('G', 30, 190);
  }, { repeat: false });
}

/** Fascia name plate above a building's entrance canopy. */
export function nameSign(name: string, accent: string) {
  return make(`name:${name}:${accent}`, 1024, 128, (g, w, h) => {
    g.fillStyle = accent;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    let size = 76;
    g.font = `700 ${size}px ${FONT}`;
    while (g.measureText(name).width > w - 60 && size > 30) {
      size -= 4;
      g.font = `700 ${size}px ${FONT}`;
    }
    g.fillText(name, (w - g.measureText(name).width) / 2, h / 2 + size / 2.8);
  }, { repeat: false });
}
