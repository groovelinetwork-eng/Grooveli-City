import * as THREE from 'three';
import { MISSIONS, PUBLIC_JOB_COUNTS, PUBLIC_TOP_JOBS, SKILL_CHALLENGES, getDistrict, type DistrictId } from '@grooveli/frontend-domain/public';

/**
 * AI Career Center display content. Everything shown is public fixture data,
 * the visitor's real bridged level (only when the web app supplied it), or a
 * plain prompt to open the web app — never invented AI output or scores.
 */
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

export interface AiVisitor {
  name: string;
  level: number | null;
  levelProgress: number | null;
  guest: boolean;
}

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function fit(g: CanvasRenderingContext2D, text: string, maxW: number) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function panel(g: CanvasRenderingContext2D, w: number, h: number, title: string, accent = '#22d3ee') {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#0d1a33');
  grd.addColorStop(1, '#0a1224');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(34,211,238,0.35)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = accent;
  g.fillRect(24, 30, 8, 44);
  g.fillStyle = '#e0f2fe';
  g.font = `800 40px ${FONT}`;
  g.fillText(title, 46, 66);
}

function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string) {
  g.fillStyle = 'rgba(148,163,184,0.18)';
  g.beginPath();
  g.roundRect(x, y, w, 16, 8);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y, Math.max(16, w * frac), 16, 8);
  g.fill();
}

/** Six-tile career intelligence wall (3 × 2), 2400 × 1200. */
export function intelligenceWallTexture(visitor: AiVisitor) {
  const W = 800;
  const H = 600;
  return tex(W * 3, H * 2, (g) => {
    const tile = (col: number, row: number, draw: () => void) => {
      g.save();
      g.translate(col * W, row * H);
      draw();
      g.restore();
    };
    // 1. Career pathways (generic progression, no promises)
    tile(0, 0, () => {
      panel(g, W, H, 'Career pathways');
      const steps = ['Explore', 'Entry', 'Mid-level', 'Senior', 'Lead'];
      steps.forEach((s, i) => {
        const x = 90 + i * 150;
        const y = 330 - i * 40;
        g.fillStyle = i === 0 ? '#22d3ee' : 'rgba(34,211,238,0.35)';
        g.beginPath();
        g.arc(x, y, 26, 0, Math.PI * 2);
        g.fill();
        if (i) {
          g.strokeStyle = 'rgba(167,139,250,0.8)';
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(x - 124, y + 40);
          g.lineTo(x - 26, y);
          g.stroke();
        }
        g.fillStyle = '#cbd5e1';
        g.font = `600 26px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(s, x, y + 66);
        g.textAlign = 'left';
      });
      g.fillStyle = '#94a3b8';
      g.font = `500 24px ${FONT}`;
      g.fillText('Plan your route in Grooveli web → Skills', 46, 540);
    });
    // 2. Opportunities (public listings)
    tile(1, 0, () => {
      panel(g, W, H, 'Open opportunities');
      PUBLIC_TOP_JOBS.slice(0, 5).forEach((j, i) => {
        const y = 120 + i * 82;
        g.fillStyle = 'rgba(30,58,95,0.7)';
        g.beginPath();
        g.roundRect(30, y, W - 60, 68, 12);
        g.fill();
        g.fillStyle = '#f8fafc';
        g.font = `700 30px ${FONT}`;
        g.fillText(fit(g, j.title, 460), 52, y + 44);
        g.fillStyle = '#7dd3fc';
        g.font = `500 22px ${FONT}`;
        g.textAlign = 'right';
        g.fillText(`${getDistrict(j.district).name.replace(/ District$/, '')} · ${j.workMode}`, W - 52, y + 42);
        g.textAlign = 'left';
      });
    });
    // 3. Where roles are (public counts by district)
    tile(2, 0, () => {
      panel(g, W, H, 'Roles by district', '#a78bfa');
      const entries = Object.entries(PUBLIC_JOB_COUNTS).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const max = Math.max(1, ...entries.map(([, n]) => n));
      entries.forEach(([d, n], i) => {
        const y = 130 + i * 72;
        g.fillStyle = '#e2e8f0';
        g.font = `600 26px ${FONT}`;
        g.fillText(fit(g, getDistrict(d as DistrictId).name.replace(/ District$/, ''), 260), 46, y + 16);
        bar(g, 320, y, 360, n / max, '#a78bfa');
        g.fillStyle = '#c4b5fd';
        g.fillText(String(n), 700, y + 16);
      });
      g.fillStyle = '#94a3b8';
      g.font = `500 22px ${FONT}`;
      g.fillText('Published roles (synthetic demo data)', 46, 560);
    });
    // 4. Personal progress (real bridged level only)
    tile(0, 1, () => {
      panel(g, W, H, 'Your progress', '#34d399');
      if (visitor.level != null) {
        g.fillStyle = '#f8fafc';
        g.font = `800 64px ${FONT}`;
        g.fillText(`Level ${visitor.level}`, 46, 210);
        g.fillStyle = '#cbd5e1';
        g.font = `600 30px ${FONT}`;
        g.fillText(fit(g, visitor.name, 680), 46, 140);
        if (visitor.levelProgress != null) {
          bar(g, 46, 260, 680, visitor.levelProgress, '#34d399');
          g.fillStyle = '#94a3b8';
          g.font = `500 24px ${FONT}`;
          g.fillText(`${Math.round(visitor.levelProgress * 100)}% to the next level`, 46, 320);
        }
      } else {
        g.fillStyle = '#cbd5e1';
        g.font = `600 32px ${FONT}`;
        g.fillText(visitor.guest ? 'Sign in on Grooveli web' : 'Open your dashboard', 46, 200);
        g.fillText('to see your progress here.', 46, 248);
      }
    });
    // 5. Recommended training (public missions)
    tile(1, 1, () => {
      panel(g, W, H, 'Missions & training', '#f59e0b');
      MISSIONS.slice(0, 5).forEach((mi, i) => {
        const y = 128 + i * 80;
        g.fillStyle = 'rgba(245,158,11,0.15)';
        g.beginPath();
        g.roundRect(30, y, W - 60, 64, 12);
        g.fill();
        g.fillStyle = '#fef3c7';
        g.font = `700 28px ${FONT}`;
        g.fillText(fit(g, mi.title, 520), 52, y + 42);
        g.fillStyle = '#fbbf24';
        g.font = `600 22px ${FONT}`;
        g.textAlign = 'right';
        g.fillText(`+${mi.rewardXp} XP`, W - 52, y + 40);
        g.textAlign = 'left';
      });
    });
    // 6. Skills challenges available (public)
    tile(2, 1, () => {
      panel(g, W, H, 'Skill challenges', '#38bdf8');
      SKILL_CHALLENGES.slice(0, 8).forEach((c, i) => {
        const x = 40 + (i % 2) * 370;
        const y = 120 + Math.floor(i / 2) * 104;
        g.fillStyle = 'rgba(56,189,248,0.15)';
        g.beginPath();
        g.roundRect(x, y, 340, 84, 14);
        g.fill();
        g.fillStyle = '#e0f2fe';
        g.font = `700 28px ${FONT}`;
        g.fillText(fit(g, c.skill, 300), x + 22, y + 52);
      });
    });
  });
}

/** Consultation pod curved display: topic + visitor greeting (no generated advice). */
export function podScreenTexture(topic: string, lines: string[], visitor: AiVisitor, accent: string) {
  return tex(1024, 400, (g) => {
    panel(g, 1024, 400, topic, accent);
    g.fillStyle = '#cbd5e1';
    g.font = `600 30px ${FONT}`;
    g.fillText(visitor.guest ? 'Welcome — sign in for a personalised session' : `Welcome back, ${visitor.name.split(' ')[0]}`, 46, 130);
    lines.forEach((l, i) => {
      g.fillStyle = 'rgba(34,211,238,0.12)';
      g.beginPath();
      g.roundRect(46 + i * 320, 180, 300, 120, 16);
      g.fill();
      g.fillStyle = '#e0f2fe';
      g.font = `700 28px ${FONT}`;
      g.fillText(fit(g, l, 260), 66 + i * 320, 252);
    });
    g.fillStyle = '#64748b';
    g.font = `500 22px ${FONT}`;
    g.fillText('Session opens in Grooveli web · rule-based assistant, no live AI', 46, 360);
  });
}

/** Generic labelled display (assessment, pathways, welcome, info, feedback). */
export function listScreenTexture(title: string, rows: string[], accent = '#22d3ee', footer?: string, w = 1024, h = 640) {
  return tex(w, h, (g) => {
    panel(g, w, h, title, accent);
    rows.forEach((r, i) => {
      const y = 112 + i * 76;
      g.fillStyle = 'rgba(148,163,184,0.12)';
      g.beginPath();
      g.roundRect(36, y, w - 72, 60, 12);
      g.fill();
      g.fillStyle = accent;
      g.beginPath();
      g.arc(70, y + 30, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e2e8f0';
      g.font = `600 30px ${FONT}`;
      g.fillText(fit(g, r, w - 160), 96, y + 41);
    });
    if (footer) {
      g.fillStyle = '#64748b';
      g.font = `500 24px ${FONT}`;
      g.fillText(fit(g, footer, w - 80), 40, h - 32);
    }
  });
}

/** Interview practice display: interviewer silhouette + practice framing. */
export function interviewScreenTexture() {
  return tex(1024, 576, (g) => {
    panel(g, 1024, 576, 'Interview practice', '#f97316');
    const grd = g.createRadialGradient(300, 320, 10, 300, 320, 200);
    grd.addColorStop(0, 'rgba(34,211,238,0.45)');
    grd.addColorStop(1, 'rgba(34,211,238,0)');
    g.fillStyle = grd;
    g.fillRect(100, 120, 400, 400);
    g.fillStyle = '#7dd3fc';
    g.beginPath();
    g.arc(300, 270, 60, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(300, 440, 120, 90, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#e2e8f0';
    g.font = `700 32px ${FONT}`;
    g.fillText('Practice mode', 560, 220);
    g.font = `500 26px ${FONT}`;
    g.fillStyle = '#cbd5e1';
    ['Structured questions', 'Timed answers', 'Self-review checklist'].forEach((t, i) => g.fillText(`• ${t}`, 560, 280 + i * 46));
    g.fillStyle = '#64748b';
    g.font = `500 22px ${FONT}`;
    g.fillText('Starts in Grooveli web · rule-based, no live AI', 560, 500);
  });
}

/** Square category label for the holographic pathway map. */
export function holoLabelTexture(text: string, color: string) {
  return tex(256, 80, (g) => {
    g.fillStyle = 'rgba(8,20,40,0.55)';
    g.beginPath();
    g.roundRect(4, 4, 248, 72, 18);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `700 34px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(text, 128, 52);
  });
}

/** Brand sign: "Grooveli AI · Career Center". */
export function aiBrandTexture() {
  return tex(1024, 256, (g) => {
    g.fillStyle = '#0b1324';
    g.beginPath();
    g.roundRect(0, 0, 1024, 256, 40);
    g.fill();
    const grd = g.createLinearGradient(40, 40, 220, 220);
    grd.addColorStop(0, '#22d3ee');
    grd.addColorStop(1, '#a78bfa');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(130, 128, 82, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0b1324';
    g.font = `900 100px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('G', 130, 162);
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = `800 84px ${FONT}`;
    g.fillText('Grooveli AI', 250, 130);
    g.fillStyle = '#67e8f9';
    g.font = `600 44px ${FONT}`;
    g.fillText('Career Center', 254, 196);
  });
}

/** Floor-projection grid for the holo table top. */
export function holoGridTexture() {
  return tex(512, 512, (g) => {
    g.fillStyle = '#04101f';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(34,211,238,0.5)';
    g.lineWidth = 2;
    for (let r = 40; r < 256; r += 46) {
      g.beginPath();
      g.arc(256, 256, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let a = 0; a < 12; a++) {
      g.beginPath();
      g.moveTo(256, 256);
      g.lineTo(256 + Math.cos((a / 12) * Math.PI * 2) * 250, 256 + Math.sin((a / 12) * Math.PI * 2) * 250);
      g.stroke();
    }
  });
}

/** Digital certification-track frame (available tracks, not earned awards). */
export function certTexture(skill: string, color: string) {
  return tex(360, 460, (g) => {
    g.fillStyle = '#0d1a33';
    g.fillRect(0, 0, 360, 460);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeRect(14, 14, 332, 432);
    g.fillStyle = color;
    g.beginPath();
    g.arc(180, 150, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0d1a33';
    g.font = `800 56px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('✓', 180, 172);
    g.fillStyle = '#e2e8f0';
    g.font = `700 34px ${FONT}`;
    g.fillText(fit(g, skill, 300), 180, 290);
    g.fillStyle = '#94a3b8';
    g.font = `500 24px ${FONT}`;
    g.fillText('Certification track', 180, 340);
    g.textAlign = 'left';
  });
}
