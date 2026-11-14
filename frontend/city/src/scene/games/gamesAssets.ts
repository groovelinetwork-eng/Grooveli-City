import * as THREE from 'three';
import { hqBrandMaterials, hqMaterials } from '../hq/hqResources';
import type { GameId } from '../../world/gamesZone';

/**
 * Games Zone textures and materials. Furniture reuses the HQ / apartment
 * physically-based library (woods, metals, fabrics, plants) so the zone
 * matches the approved interiors; this module adds the game-specific surfaces
 * (boards, felt, game pieces, neon accents, signage). Everything is created
 * once and shared; day/night only changes emissive intensities.
 */
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
const cache = new Map<string, THREE.CanvasTexture>();

function tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Gradient "G" mark (Grooveli brand), drawn into a box of the given size. */
function gMark(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const grd = g.createLinearGradient(x, y, x + s, y + s);
  grd.addColorStop(0, '#22d3ee');
  grd.addColorStop(0.5, '#3b82f6');
  grd.addColorStop(1, '#8b5cf6');
  g.fillStyle = grd;
  g.font = `900 ${Math.round(s * 1.05)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('G', x + s / 2, y + s / 2 + s * 0.04);
  g.textAlign = 'left';
}

/** Gamepad outline icon. */
function padIcon(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.save();
  g.translate(cx, cy);
  g.scale(s / 100, s / 100);
  g.strokeStyle = color;
  g.lineWidth = 8;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-30, -26);
  g.lineTo(30, -26);
  g.bezierCurveTo(48, -26, 52, -10, 56, 10);
  g.bezierCurveTo(60, 30, 50, 40, 38, 30);
  g.lineTo(26, 18);
  g.lineTo(-26, 18);
  g.lineTo(-38, 30);
  g.bezierCurveTo(-50, 40, -60, 30, -56, 10);
  g.bezierCurveTo(-52, -10, -48, -26, -30, -26);
  g.closePath();
  g.stroke();
  g.fillStyle = color;
  g.fillRect(-36, -6, 20, 6);
  g.fillRect(-29, -13, 6, 20);
  for (const [bx, by] of [
    [26, -10],
    [36, -2],
    [26, 6],
    [16, -2],
  ])
    dot(g, bx!, by!, 4);
  g.restore();
}

// ------------------------------------------------------------------ boards

export function chessBoardTexture() {
  return tex('games-chess', 512, 512, (g, w) => {
    g.fillStyle = '#3a2416';
    g.fillRect(0, 0, w, w);
    const m = 28;
    const s = (w - m * 2) / 8;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        g.fillStyle = (r + c) % 2 ? '#7a4a2a' : '#ecd9b6';
        g.fillRect(m + c * s, m + r * s, s, s);
      }
    g.strokeStyle = '#c9a36b';
    g.lineWidth = 3;
    g.strokeRect(m - 4, m - 4, s * 8 + 8, s * 8 + 8);
  });
}

export function checkersBoardTexture() {
  return tex('games-checkers', 512, 512, (g, w) => {
    g.fillStyle = '#1f1612';
    g.fillRect(0, 0, w, w);
    const m = 28;
    const s = (w - m * 2) / 8;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        g.fillStyle = (r + c) % 2 ? '#2b2320' : '#c43b32';
        g.fillRect(m + c * s, m + r * s, s, s);
      }
    g.strokeStyle = '#e9d8b4';
    g.lineWidth = 3;
    g.strokeRect(m - 4, m - 4, s * 8 + 8, s * 8 + 8);
  });
}

const LUDO = { red: '#e23b3b', green: '#22a559', yellow: '#f2c12e', blue: '#2f6fe0' } as const;

/** Classic Ludo layout: four home yards, cross-shaped track, coloured home columns, centre triangles. */
export function ludoBoardTexture() {
  return tex('games-ludo', 600, 600, (g, w) => {
    const u = w / 15;
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, w, w);
    const yard = (x: number, y: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x * u, y * u, 6 * u, 6 * u);
      g.fillStyle = '#fff';
      roundRect(g, (x + 1) * u, (y + 1) * u, 4 * u, 4 * u, u * 0.5);
      g.fill();
      g.fillStyle = col;
      for (const [dx, dy] of [
        [2, 2],
        [4, 2],
        [2, 4],
        [4, 4],
      ])
        dot(g, (x + dx!) * u, (y + dy!) * u, u * 0.62);
    };
    yard(0, 0, LUDO.red);
    yard(9, 0, LUDO.green);
    yard(0, 9, LUDO.blue);
    yard(9, 9, LUDO.yellow);
    g.strokeStyle = '#9aa3b2';
    g.lineWidth = 1.5;
    const cell = (cx: number, cy: number, fill?: string) => {
      if (fill) {
        g.fillStyle = fill;
        g.fillRect(cx * u, cy * u, u, u);
      }
      g.strokeRect(cx * u, cy * u, u, u);
    };
    for (let i = 0; i < 6; i++) {
      for (const j of [6, 7, 8]) {
        cell(j, i, j === 7 && i > 0 ? LUDO.green : undefined);
        cell(j, 14 - i, j === 7 && i > 0 ? LUDO.blue : undefined);
        cell(i, j, j === 7 && i > 0 ? LUDO.red : undefined);
        cell(14 - i, j, j === 7 && i > 0 ? LUDO.yellow : undefined);
      }
    }
    // start squares
    cell(1, 6, LUDO.red);
    cell(8, 1, LUDO.green);
    cell(13, 8, LUDO.yellow);
    cell(6, 13, LUDO.blue);
    const tri = (pts: [number, number][], col: string) => {
      g.fillStyle = col;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x * u, y * u) : g.moveTo(x * u, y * u)));
      g.closePath();
      g.fill();
    };
    tri([[6, 6], [9, 6], [7.5, 7.5]], LUDO.green);
    tri([[9, 6], [9, 9], [7.5, 7.5]], LUDO.yellow);
    tri([[9, 9], [6, 9], [7.5, 7.5]], LUDO.blue);
    tri([[6, 9], [6, 6], [7.5, 7.5]], LUDO.red);
  });
}

export function puzzleMatTexture() {
  return tex('games-puzzle-mat', 512, 340, (g, w, h) => {
    g.fillStyle = '#1b2440';
    g.fillRect(0, 0, w, h);
    const cols = ['#38bdf8', '#a78bfa', '#f472b6', '#22c55e', '#facc15', '#fb923c'];
    let k = 0;
    for (let y = 30; y < h - 20; y += 70)
      for (let x = 30; x < w - 20; x += 80) {
        g.save();
        g.translate(x + ((k * 13) % 17), y + ((k * 7) % 11));
        g.rotate(((k * 37) % 90) * (Math.PI / 180));
        g.fillStyle = cols[k % cols.length]!;
        g.beginPath();
        g.moveTo(-20, -20);
        g.lineTo(-6, -20);
        g.arc(0, -20, 6, Math.PI, 0, false);
        g.lineTo(20, -20);
        g.lineTo(20, -6);
        g.arc(20, 0, 6, -Math.PI / 2, Math.PI / 2, false);
        g.lineTo(20, 20);
        g.lineTo(-20, 20);
        g.closePath();
        g.fill();
        g.restore();
        k++;
      }
  });
}

// ------------------------------------------------------------------ signage

const AREA_LABEL: Record<GameId, string> = { chess: 'Chess', checkers: 'Checkers', pool: '8-Ball Pool', ludo: 'Ludo', puzzle: 'Puzzles' };

function areaIcon(g: CanvasRenderingContext2D, id: GameId, cx: number, cy: number, s: number) {
  g.save();
  g.fillStyle = '#ffffff';
  if (id === 'chess') {
    g.font = `${Math.round(s * 1.15)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♟', cx, cy + s * 0.05);
  } else if (id === 'checkers') {
    for (const [dy, col] of [
      [0.18, '#ffffff'],
      [-0.02, '#c4b5fd'],
      [-0.22, '#ffffff'],
    ] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(cx, cy + dy * s, s * 0.42, s * 0.16, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (id === 'pool') {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111827';
    g.beginPath();
    g.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `800 ${Math.round(s * 0.3)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('8', cx, cy + 1);
  } else if (id === 'ludo') {
    roundRect(g, cx - s * 0.38, cy - s * 0.38, s * 0.76, s * 0.76, s * 0.12);
    g.fill();
    g.fillStyle = '#111827';
    for (const [dx, dy] of [
      [-0.18, -0.18],
      [0.18, 0.18],
      [0, 0],
      [0.18, -0.18],
      [-0.18, 0.18],
    ])
      dot(g, cx + dx! * s, cy + dy! * s, s * 0.06);
  } else {
    g.translate(cx, cy);
    g.scale(s / 48, s / 48);
    g.beginPath();
    g.moveTo(-18, -18);
    g.lineTo(-5, -18);
    g.arc(0, -18, 5, Math.PI, 0, false);
    g.lineTo(18, -18);
    g.lineTo(18, -5);
    g.arc(18, 0, 5, -Math.PI / 2, Math.PI / 2, false);
    g.lineTo(18, 18);
    g.lineTo(-18, 18);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** Pill sign for a game area (reference: dark rounded signs with icon + name). */
export function areaSignTexture(id: GameId) {
  return tex(`games-sign-${id}`, 512, 150, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    roundRect(g, 4, 4, w - 8, h - 8, (h - 8) / 2);
    g.fillStyle = '#121a33';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#a78bfa';
    g.stroke();
    areaIcon(g, id, 82, h / 2, 74);
    g.fillStyle = '#ffffff';
    g.font = `800 ${id === 'pool' ? 58 : 64}px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(AREA_LABEL[id], 140, h / 2 + 3);
  });
}

export function hubSignTexture() {
  return tex('games-hub-sign', 1024, 256, (g, w, h) => {
    g.fillStyle = '#0d1430';
    g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#22d3ee');
    grd.addColorStop(1, '#a855f7');
    g.fillStyle = grd;
    g.fillRect(0, h - 10, w, 10);
    gMark(g, 70, 48, 160);
    g.fillStyle = '#ffffff';
    g.font = `800 92px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText('Grooveli', 270, 92);
    g.font = `700 70px ${FONT}`;
    g.fillStyle = '#e9e3ff';
    g.fillText('Games Hub', 272, 178);
  });
}

export function zoneSignTexture() {
  return tex('games-zone-sign', 1024, 300, (g, w, h) => {
    g.fillStyle = '#0d1430';
    g.fillRect(0, 0, w, h);
    padIcon(g, 170, h / 2, 210, '#38bdf8');
    g.fillStyle = '#ffffff';
    g.font = `800 112px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText('Games Zone', 330, 118);
    g.fillStyle = '#7dd3fc';
    g.font = `600 56px ${FONT}`;
    g.fillText('Play • Relax • Connect', 334, 214);
  });
}

/** Pavilion-side screen (reference: "Play / Connect / Compete"). */
export function playConnectTexture() {
  return tex('games-play-connect', 512, 384, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#1e1b6b');
    grd.addColorStop(1, '#5b21b6');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = `800 70px ${FONT}`;
    g.textBaseline = 'middle';
    ['Play', 'Connect', 'Compete'].forEach((t, i) => g.fillText(t, 36, 90 + i * 100));
    // trophy
    g.fillStyle = '#facc15';
    g.beginPath();
    g.moveTo(370, 110);
    g.lineTo(470, 110);
    g.bezierCurveTo(470, 210, 430, 230, 420, 235);
    g.lineTo(420, 270);
    g.lineTo(445, 290);
    g.lineTo(395, 290);
    g.lineTo(420, 270);
    g.lineTo(420, 235);
    g.bezierCurveTo(410, 230, 370, 210, 370, 110);
    g.fill();
    g.fillRect(380, 290, 80, 18);
  });
}

/** Leaderboard screen — honest: no scores exist yet. */
export function leaderboardTexture() {
  return tex('games-leaderboard', 512, 300, (g, w, h) => {
    g.fillStyle = '#0d1430';
    g.fillRect(0, 0, w, h);
    gMark(g, 24, 20, 56);
    g.fillStyle = '#ffffff';
    g.font = `800 40px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText('Tournaments', 100, 52);
    g.fillStyle = '#c4b5fd';
    g.font = `600 30px ${FONT}`;
    g.fillText('& leaderboards', 100, 96);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(167,139,250,0.18)';
      roundRect(g, 28, 130 + i * 34, w - 56, 26, 8);
      g.fill();
    }
    g.fillStyle = '#facc15';
    g.font = `800 34px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('COMING SOON', w / 2, h - 46);
    g.textAlign = 'left';
  });
}

export function puzzleConsoleTexture() {
  return tex('games-puzzle-console', 384, 256, (g, w, h) => {
    g.fillStyle = '#0b1530';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#38bdf8';
    g.lineWidth = 3;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.strokeRect(40 + c * 46, 40 + r * 46, 40, 40);
    g.fillStyle = 'rgba(56,189,248,0.45)';
    for (const [c, r] of [
      [0, 0],
      [1, 2],
      [3, 1],
      [2, 3],
    ])
      g.fillRect(42 + c! * 46, 42 + r! * 46, 36, 36);
    g.fillStyle = '#e0f2fe';
    g.font = `800 30px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText('Puzzles', 236, 96);
    g.fillStyle = '#facc15';
    g.font = `700 22px ${FONT}`;
    g.fillText('Coming soon', 236, 140);
  });
}

/** Floor emblem for the lounge disc (transparent around the mark). */
export function gEmblemTexture() {
  return tex('games-g-emblem', 512, 512, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2);
    g.stroke();
    gMark(g, w * 0.2, w * 0.2, w * 0.6);
  });
}

// ------------------------------------------------------------------ materials

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const glow = (color: string, intensity: number) => std({ color, emissive: color, emissiveIntensity: intensity, toneMapped: false });

function build() {
  const m = hqMaterials();
  const violet = hqBrandMaterials('#7c3aed');
  return {
    m,
    violetFabric: violet.brandFabric,
    navyFabric: m.navyFabric,
    // decks and architecture
    deckWest: std({ color: '#cdb79a', roughness: 0.7 }),
    deckEast: std({ color: '#d7d2ca', roughness: 0.75 }),
    deckStep: std({ color: '#bfb7ab', roughness: 0.8 }),
    stone: std({ color: '#e7e2da', roughness: 0.55 }),
    darkSteel: std({ color: '#262a33', roughness: 0.42, metalness: 0.75 }),
    roof: std({ color: '#4a5263', roughness: 0.5, metalness: 0.35 }),
    pavilionFloor: std({ color: '#2f3442', roughness: 0.25, metalness: 0.1 }),
    navy: std({ color: '#121a33', roughness: 0.45, metalness: 0.2 }),
    glass: m.glassPane,
    interior: std({ color: '#fff4e0', emissive: '#ffd9a0', emissiveIntensity: 0.35, roughness: 0.6 }),
    // neon / light work (intensities set by setGamesNight)
    violetGlow: glow('#a78bfa', 1.4),
    cyanGlow: glow('#5ee7ff', 1.4),
    pinkGlow: glow('#e879f9', 1.6),
    warmBulb: glow('#ffd9a0', 1.2),
    lampUnder: glow('#fff1d0', 1.0),
    // games
    felt: std({ color: '#147a3c', roughness: 0.95 }),
    feltRail: std({ color: '#0e5f2e', roughness: 0.9 }),
    pocket: std({ color: '#0b0b0f', roughness: 0.6 }),
    chessWhite: std({ color: '#f1e8d6', roughness: 0.32 }),
    chessBlack: std({ color: '#1f1b22', roughness: 0.3 }),
    checkerRed: std({ color: '#b91c1c', roughness: 0.35 }),
    checkerBlack: std({ color: '#18181b', roughness: 0.35 }),
    diceWhite: std({ color: '#f8fafc', roughness: 0.3 }),
    pip: std({ color: '#111827', roughness: 0.5 }),
    tokens: {
      red: std({ color: '#e23b3b', roughness: 0.28 }),
      blue: std({ color: '#2f6fe0', roughness: 0.28 }),
      yellow: std({ color: '#f2c12e', roughness: 0.28 }),
      green: std({ color: '#22a559', roughness: 0.28 }),
    },
    holo: std({ color: '#5ee7ff', emissive: '#38bdf8', emissiveIntensity: 1.2, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    marble: m.marble,
    // textured surfaces
    chessBoard: std({ map: chessBoardTexture(), roughness: 0.35 }),
    checkersBoard: std({ map: checkersBoardTexture(), roughness: 0.35 }),
    ludoBoard: std({ map: ludoBoardTexture(), roughness: 0.4 }),
    puzzleMat: std({ map: puzzleMatTexture(), roughness: 0.7 }),
  };
}

export type GamesMaterials = ReturnType<typeof build>;
let shared: GamesMaterials | null = null;
export function gamesMaterials(): GamesMaterials {
  return (shared ??= build());
}

/** Unlit signage material (keeps sign colours true by day and night). */
const signMats = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
export function signMaterial(t: THREE.Texture, transparent = false) {
  let s = signMats.get(t);
  if (!s) {
    s = new THREE.MeshBasicMaterial({ map: t, transparent, toneMapped: false });
    signMats.set(t, s);
  }
  return s;
}

export function setGamesNight(G: GamesMaterials, night: boolean) {
  G.violetGlow.emissiveIntensity = night ? 2.6 : 1.1;
  G.cyanGlow.emissiveIntensity = night ? 2.6 : 1.1;
  G.pinkGlow.emissiveIntensity = night ? 3.0 : 1.4;
  G.warmBulb.emissiveIntensity = night ? 2.6 : 0.6;
  G.lampUnder.emissiveIntensity = night ? 2.2 : 0.7;
  G.interior.emissiveIntensity = night ? 1.1 : 0.3;
  G.holo.emissiveIntensity = night ? 2.0 : 1.1;
}
