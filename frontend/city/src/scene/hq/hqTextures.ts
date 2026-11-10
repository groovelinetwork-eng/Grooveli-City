import * as THREE from 'three';
import type { PublicHqProjection } from '@grooveli/frontend-domain/public';

/**
 * Company-specific display textures for the HQ, drawn from the PUBLIC HQ
 * projection only. Screens that would need private data (analytics, HR) show
 * a sign-in prompt, never invented figures.
 */
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

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

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 4) {
  const words = text.split(/\s+/);
  let line = '';
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]!;
    if (g.measureText(test).width > maxW && line) {
      if (n === maxLines - 1) {
        g.fillText(`${line}…`, x, y + n * lineH);
        return n + 1;
      }
      g.fillText(line, x, y + n * lineH);
      line = words[i]!;
      n++;
    } else line = test;
  }
  if (line) g.fillText(line, x, y + n * lineH);
  return n + 1;
}

function fit(g: CanvasRenderingContext2D, text: string, maxW: number) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function logoMark(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, glyph: string) {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y, s, s, s * 0.22);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = `800 ${s * 0.62}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, x + s / 2, y + s * 0.54);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

type Org = PublicHqProjection['organization'];

/** Logo + name lockup on transparent background (signage, monolith). */
export function logoTexture(org: Org, dark = false) {
  return tex(1024, 256, (g) => {
    logoMark(g, 16, 28, 200, org.logoColor, org.logoGlyph);
    g.fillStyle = dark ? '#1f2330' : '#ffffff';
    g.font = `800 92px ${FONT}`;
    g.fillText(fit(g, org.name, 760), 250, 150);
    g.font = `500 44px ${FONT}`;
    g.fillStyle = dark ? '#4b5163' : 'rgba(255,255,255,0.85)';
    g.fillText(fit(g, org.tagline, 760), 252, 214);
  });
}

/** Culture & values graphic panel (wide). */
export function cultureTexture(org: Org) {
  return tex(1600, 560, (g) => {
    const grd = g.createLinearGradient(0, 0, 1600, 560);
    grd.addColorStop(0, '#231c3d');
    grd.addColorStop(1, '#1d2b4f');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1600, 560);
    g.fillStyle = org.logoColor;
    g.fillRect(0, 0, 14, 560);
    logoMark(g, 60, 56, 110, org.logoColor, org.logoGlyph);
    g.fillStyle = '#ffffff';
    g.font = `800 58px ${FONT}`;
    g.fillText(fit(g, org.name, 520), 190, 112);
    g.font = `600 30px ${FONT}`;
    g.fillStyle = '#c4b5fd';
    g.fillText(fit(g, org.tagline, 520), 192, 156);
    g.font = `400 27px ${FONT}`;
    g.fillStyle = '#e5e7eb';
    wrap(g, org.description, 60, 236, 560, 38, 7);
    // values
    g.fillStyle = '#ffffff';
    g.font = `700 34px ${FONT}`;
    g.fillText('Our values', 700, 112);
    g.font = `600 30px ${FONT}`;
    org.values.slice(0, 6).forEach((v, i) => {
      const y = 150 + i * 62;
      g.fillStyle = 'rgba(167,139,250,0.22)';
      g.beginPath();
      g.roundRect(700, y, 380, 48, 24);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillText(fit(g, v, 340), 724, y + 34);
    });
    // benefits & ways of working
    g.font = `700 34px ${FONT}`;
    g.fillText('Life here', 1140, 112);
    g.font = `400 26px ${FONT}`;
    g.fillStyle = '#e5e7eb';
    const lines = [...org.benefits.slice(0, 5).map((b) => `• ${b}`), `• Work: ${org.workArrangements.join(' · ')}`];
    lines.forEach((l, i) => g.fillText(fit(g, l, 420), 1140, 160 + i * 44));
    g.font = `400 22px ${FONT}`;
    g.fillStyle = '#9ca3af';
    wrap(g, org.culture.environment, 1140, 450, 420, 30, 3);
  });
}

/** "We're hiring" vacancies screen (live public vacancies). */
export function vacanciesTexture(hq: PublicHqProjection) {
  return tex(1024, 576, (g) => {
    g.fillStyle = '#0f172a';
    g.fillRect(0, 0, 1024, 576);
    g.fillStyle = hq.organization.logoColor;
    g.fillRect(0, 0, 1024, 92);
    g.fillStyle = '#ffffff';
    g.font = `800 50px ${FONT}`;
    g.fillText(hq.vacancies.length ? "We're hiring" : 'Careers', 40, 64);
    g.font = `600 30px ${FONT}`;
    g.textAlign = 'right';
    g.fillText(`${hq.vacancies.length} open role${hq.vacancies.length === 1 ? '' : 's'}`, 984, 60);
    g.textAlign = 'left';
    if (!hq.vacancies.length) {
      g.fillStyle = '#cbd5e1';
      g.font = `500 34px ${FONT}`;
      g.fillText('No open positions right now.', 40, 200);
      return;
    }
    hq.vacancies.slice(0, 5).forEach((v, i) => {
      const y = 120 + i * 88;
      g.fillStyle = i % 2 ? '#162036' : '#1b2741';
      g.beginPath();
      g.roundRect(28, y, 968, 76, 14);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = `700 32px ${FONT}`;
      g.fillText(fit(g, v.title, 620), 52, y + 48);
      g.fillStyle = '#93c5fd';
      g.font = `500 24px ${FONT}`;
      g.textAlign = 'right';
      g.fillText(fit(g, `${v.department} · ${v.workMode}`, 300), 972, y + 46);
      g.textAlign = 'left';
    });
  });
}

/** "How we hire" printed panel. */
export function hiringStepsTexture(color: string) {
  return tex(1024, 320, (g) => {
    g.fillStyle = '#f7f3ec';
    g.fillRect(0, 0, 1024, 320);
    g.fillStyle = '#1f2330';
    g.font = `800 44px ${FONT}`;
    g.fillText('How we hire', 40, 70);
    const steps = ['Apply', 'Screen', 'Interview', 'Offer'];
    steps.forEach((s, i) => {
      const x = 40 + i * 245;
      g.fillStyle = color;
      g.beginPath();
      g.arc(x + 40, 170, 38, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `800 36px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(String(i + 1), x + 40, 183);
      g.fillStyle = '#1f2330';
      g.font = `700 30px ${FONT}`;
      g.fillText(s, x + 40, 260);
      g.textAlign = 'left';
      if (i < steps.length - 1) {
        g.strokeStyle = '#c9bfae';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(x + 92, 170);
        g.lineTo(x + 230, 170);
        g.stroke();
      }
    });
  });
}

/** Lobby information totem: welcome + public announcements. */
export function announcementsTexture(hq: PublicHqProjection) {
  return tex(512, 1024, (g) => {
    g.fillStyle = '#101829';
    g.fillRect(0, 0, 512, 1024);
    logoMark(g, 40, 50, 96, hq.organization.logoColor, hq.organization.logoGlyph);
    g.fillStyle = '#ffffff';
    g.font = `800 40px ${FONT}`;
    g.fillText('Welcome', 40, 210);
    g.font = `500 28px ${FONT}`;
    g.fillStyle = '#cbd5e1';
    wrap(g, `to ${hq.organization.name}. Please check in at reception.`, 40, 256, 430, 36, 3);
    g.fillStyle = '#a78bfa';
    g.font = `700 28px ${FONT}`;
    g.fillText('NOTICES', 40, 420);
    const list = hq.announcements.slice(0, 3);
    if (!list.length) {
      g.fillStyle = '#94a3b8';
      g.font = `500 26px ${FONT}`;
      g.fillText('No public announcements.', 40, 470);
    }
    list.forEach((a, i) => {
      const y = 450 + i * 170;
      g.fillStyle = '#1c2840';
      g.beginPath();
      g.roundRect(30, y, 452, 150, 16);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = `700 28px ${FONT}`;
      wrap(g, a.title, 52, y + 46, 410, 34, 2);
      g.fillStyle = '#94a3b8';
      g.font = `500 22px ${FONT}`;
      g.fillText(a.publishedAt.slice(0, 10), 52, y + 128);
    });
  });
}

/** Employee directory touchscreen (opted-in public directory only). */
export function directoryTexture(hq: PublicHqProjection) {
  return tex(512, 720, (g) => {
    g.fillStyle = '#f8fafc';
    g.fillRect(0, 0, 512, 720);
    g.fillStyle = hq.organization.logoColor;
    g.fillRect(0, 0, 512, 110);
    g.fillStyle = '#fff';
    g.font = `800 40px ${FONT}`;
    g.fillText('Find a colleague', 32, 70);
    g.fillStyle = '#e2e8f0';
    g.beginPath();
    g.roundRect(28, 136, 456, 64, 32);
    g.fill();
    g.fillStyle = '#64748b';
    g.font = `500 26px ${FONT}`;
    g.fillText('Search name or team', 64, 178);
    const depts = hq.departments.length ? hq.departments : ['Teams'];
    depts.slice(0, 6).forEach((d, i) => {
      const y = 232 + i * 74;
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#e2e8f0';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(28, y, 456, 60, 12);
      g.fill();
      g.stroke();
      g.fillStyle = '#0f172a';
      g.font = `600 26px ${FONT}`;
      g.fillText(fit(g, d, 330), 52, y + 39);
      g.fillStyle = '#94a3b8';
      g.textAlign = 'right';
      g.fillText('›', 460, y + 40);
      g.textAlign = 'left';
    });
    g.fillStyle = '#64748b';
    g.font = `500 22px ${FONT}`;
    g.fillText(`${hq.directory.length} people listed (opted in)`, 32, 690);
  });
}

/** Department name blade sign. */
export function deptSignTexture(name: string, color: string) {
  return tex(768, 192, (g) => {
    g.fillStyle = '#25272e';
    g.beginPath();
    g.roundRect(0, 0, 768, 192, 24);
    g.fill();
    g.fillStyle = color;
    g.fillRect(36, 52, 10, 88);
    g.fillStyle = '#ffffff';
    g.font = `700 64px ${FONT}`;
    g.fillText(fit(g, name, 660), 74, 120);
  });
}

/** Wayfinding sign with arrows. */
export function wayfindingTexture(rows: [string, '←' | '→' | '↑' | '↓'][]) {
  return tex(768, 96 + rows.length * 84, (g) => {
    g.fillStyle = '#25272e';
    g.beginPath();
    g.roundRect(0, 0, 768, 96 + rows.length * 84, 22);
    g.fill();
    rows.forEach(([label, arrow], i) => {
      const y = 92 + i * 84;
      g.fillStyle = '#a78bfa';
      g.font = `800 58px ${FONT}`;
      g.fillText(arrow, 40, y);
      g.fillStyle = '#ffffff';
      g.font = `600 50px ${FONT}`;
      g.fillText(fit(g, label, 600), 130, y - 4);
    });
  });
}

/** HR information display — services only, no personal data. */
export function hrInfoTexture() {
  return tex(800, 480, (g) => {
    g.fillStyle = '#0f2a2a';
    g.fillRect(0, 0, 800, 480);
    g.fillStyle = '#5eead4';
    g.font = `800 46px ${FONT}`;
    g.fillText('Employee services', 40, 76);
    const tiles = ['Onboarding', 'Leave', 'Attendance', 'Documents', 'Policies', 'Wellbeing'];
    tiles.forEach((t, i) => {
      const x = 40 + (i % 3) * 245;
      const y = 120 + Math.floor(i / 3) * 140;
      g.fillStyle = '#163d3c';
      g.beginPath();
      g.roundRect(x, y, 225, 120, 18);
      g.fill();
      g.fillStyle = '#ccfbf1';
      g.font = `700 30px ${FONT}`;
      g.fillText(t, x + 22, y + 72);
    });
    g.fillStyle = '#99f6e4';
    g.font = `500 24px ${FONT}`;
    g.fillText('Sign in to the Grooveli workspace to use these services', 40, 452);
  });
}

/** Onboarding pinboard (generic checklist). */
export function onboardingTexture(color: string) {
  return tex(780, 540, (g) => {
    g.fillStyle = '#c69a66';
    g.fillRect(0, 0, 780, 540);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(90,55,25,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 780, Math.random() * 540, 2, 2);
    }
    g.fillStyle = '#ffffff';
    g.fillRect(40, 36, 420, 300);
    g.fillStyle = color;
    g.fillRect(40, 36, 420, 56);
    g.fillStyle = '#fff';
    g.font = `800 34px ${FONT}`;
    g.fillText('Your first week', 60, 76);
    g.fillStyle = '#1f2330';
    g.font = `500 26px ${FONT}`;
    ['Meet your buddy', 'Set up equipment', 'Read the handbook', 'Book IT induction', 'Team lunch'].forEach((t, i) => {
      g.strokeStyle = '#94a3b8';
      g.lineWidth = 3;
      g.strokeRect(64, 116 + i * 42, 24, 24);
      g.fillText(t, 104, 137 + i * 42);
    });
    const notes: [string, string][] = [
      ['#fde68a', 'Policies'],
      ['#bbf7d0', 'Wellbeing'],
      ['#bfdbfe', 'Training'],
      ['#fbcfe8', 'Buddy scheme'],
    ];
    notes.forEach(([c, t], i) => {
      const x = 500 + (i % 2) * 130;
      const y = 50 + Math.floor(i / 2) * 150;
      g.save();
      g.translate(x + 55, y + 55);
      g.rotate((i % 2 ? 1 : -1) * 0.06);
      g.fillStyle = c;
      g.fillRect(-55, -55, 115, 115);
      g.fillStyle = '#1f2330';
      g.font = `600 20px ${FONT}`;
      g.fillText(t, -45, 5);
      g.restore();
    });
    g.fillStyle = '#ffffff';
    g.fillRect(40, 370, 700, 130);
    g.fillStyle = '#1f2330';
    g.font = `700 28px ${FONT}`;
    g.fillText('Questions? Visit the HR counter or open', 60, 420);
    g.fillText('Employee services in the Grooveli workspace.', 60, 462);
  });
}

/** Management terminal: no figures until a permitted member signs in. */
export function analyticsTexture(color: string) {
  return tex(640, 400, (g) => {
    g.fillStyle = '#121624';
    g.fillRect(0, 0, 640, 400);
    g.fillStyle = '#1d2336';
    for (let i = 0; i < 3; i++) g.fillRect(24 + i * 202, 70, 186, 90);
    g.fillRect(24, 178, 380, 196);
    g.fillRect(420, 178, 196, 196);
    g.strokeStyle = 'rgba(148,163,184,0.35)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(44, 330);
    for (let i = 1; i <= 8; i++) g.lineTo(44 + i * 42, 330 - Math.sin(i * 0.9) * 30 - i * 8);
    g.stroke();
    g.fillStyle = color;
    g.font = `800 30px ${FONT}`;
    g.fillText('Workforce insights', 24, 46);
    // lock overlay
    g.fillStyle = 'rgba(10,12,20,0.72)';
    g.fillRect(150, 210, 340, 110);
    g.fillStyle = '#ffffff';
    g.font = `700 28px ${FONT}`;
    g.fillText('🔒 Sign in to view', 196, 276);
  });
}

/** Conference room display. */
export function meetingScreenTexture(org: Org) {
  return tex(1024, 576, (g) => {
    const grd = g.createLinearGradient(0, 0, 1024, 576);
    grd.addColorStop(0, '#1e1b4b');
    grd.addColorStop(1, '#0f172a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 576);
    logoMark(g, 412, 120, 200, org.logoColor, org.logoGlyph);
    g.fillStyle = '#ffffff';
    g.font = `800 56px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('Conference room', 512, 410);
    g.font = `500 30px ${FONT}`;
    g.fillStyle = '#c7d2fe';
    g.fillText('Company events & team activities', 512, 462);
    g.textAlign = 'left';
  });
}

/** Interview scheduling tablet. */
export function scheduleTexture(color: string) {
  return tex(360, 480, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 360, 480);
    g.fillStyle = color;
    g.fillRect(0, 0, 360, 80);
    g.fillStyle = '#fff';
    g.font = `800 32px ${FONT}`;
    g.fillText('Interviews', 24, 52);
    g.fillStyle = '#334155';
    g.font = `600 22px ${FONT}`;
    ['09:00', '10:30', '13:00', '15:30'].forEach((t, i) => {
      const y = 112 + i * 86;
      g.fillStyle = '#f1f5f9';
      g.beginPath();
      g.roundRect(18, y, 324, 70, 12);
      g.fill();
      g.fillStyle = '#0f172a';
      g.fillText(t, 36, y + 43);
      g.fillStyle = '#94a3b8';
      g.fillText('Slot', 150, y + 43);
    });
  });
}

/** Lounge noticeboard: values + workplace culture notes. */
export function noticeboardTexture(org: Org) {
  return tex(760, 600, (g) => {
    g.fillStyle = '#c69a66';
    g.fillRect(0, 0, 760, 600);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = `rgba(90,55,25,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 760, Math.random() * 600, 2, 2);
    }
    const colors = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];
    const notes = [...org.values.slice(0, 4), 'Kudos board', 'Team lunch'];
    notes.forEach((t, i) => {
      const x = 40 + (i % 3) * 235;
      const y = 40 + Math.floor(i / 3) * 270;
      g.save();
      g.translate(x + 100, y + 110);
      g.rotate(((i * 37) % 7 - 3) * 0.02);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(-94, -100, 200, 216);
      g.fillStyle = colors[i % colors.length]!;
      g.fillRect(-100, -106, 200, 216);
      g.fillStyle = '#dc2626';
      g.beginPath();
      g.arc(0, -92, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f2330';
      g.font = `700 30px ${FONT}`;
      g.textAlign = 'center';
      wrap(g, t, 0, -20, 170, 36, 3);
      g.textAlign = 'left';
      g.restore();
    });
  });
}

/** Whiteboard sketch (boxes, arrows, sticky notes — no text). */
export function whiteboardTexture() {
  return tex(700, 450, (g) => {
    g.fillStyle = '#fbfbf9';
    g.fillRect(0, 0, 700, 450);
    g.lineWidth = 5;
    g.strokeStyle = '#2563eb';
    g.strokeRect(50, 60, 160, 90);
    g.strokeRect(280, 60, 160, 90);
    g.strokeStyle = '#16a34a';
    g.strokeRect(500, 60, 150, 90);
    g.strokeStyle = '#1f2937';
    g.beginPath();
    g.moveTo(210, 105);
    g.lineTo(280, 105);
    g.moveTo(440, 105);
    g.lineTo(500, 105);
    g.moveTo(360, 150);
    g.lineTo(360, 230);
    g.stroke();
    g.strokeStyle = '#dc2626';
    g.beginPath();
    g.ellipse(360, 290, 110, 55, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#475569';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(60, 230 + i * 34);
      g.lineTo(180 - i * 18, 230 + i * 34);
      g.stroke();
    }
    ['#fde68a', '#fbcfe8', '#bfdbfe'].forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(520 + (i % 2) * 70, 200 + i * 60, 62, 62);
    });
  });
}

/** Desk-monitor content variants (abstract UI, no text). */
export function screenTexture(variant: number) {
  return tex(320, 200, (g) => {
    const v = variant % 6;
    if (v === 0) {
      // code editor
      g.fillStyle = '#1e1e2e';
      g.fillRect(0, 0, 320, 200);
      const cols = ['#89b4fa', '#f38ba8', '#a6e3a1', '#f9e2af', '#cba6f7', '#94e2d5'];
      for (let i = 0; i < 14; i++) {
        let x = 16 + (i % 4) * 12;
        for (let k = 0; k < 3; k++) {
          const w = 18 + ((i * 7 + k * 13) % 50);
          g.fillStyle = cols[(i + k) % cols.length]!;
          g.fillRect(x, 12 + i * 13, w, 6);
          x += w + 8;
        }
      }
    } else if (v === 1) {
      // spreadsheet
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 320, 200);
      g.fillStyle = '#16a34a';
      g.fillRect(0, 0, 320, 18);
      g.strokeStyle = '#d4d4d8';
      for (let x = 0; x < 320; x += 40) g.strokeRect(x, 18, 40, 182);
      for (let y = 18; y < 200; y += 14) g.strokeRect(0, y, 320, 14);
      g.fillStyle = '#bbf7d0';
      g.fillRect(80, 46, 40, 56);
    } else if (v === 2) {
      // design canvas
      g.fillStyle = '#2b2d31';
      g.fillRect(0, 0, 320, 200);
      g.fillStyle = '#f5f5f4';
      g.fillRect(60, 20, 200, 160);
      g.fillStyle = '#a78bfa';
      g.fillRect(80, 40, 160, 50);
      g.fillStyle = '#fb923c';
      g.beginPath();
      g.arc(120, 135, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#60a5fa';
      g.fillRect(160, 110, 70, 50);
    } else if (v === 3) {
      // dashboard
      g.fillStyle = '#f1f5f9';
      g.fillRect(0, 0, 320, 200);
      g.fillStyle = '#ffffff';
      g.fillRect(12, 12, 140, 80);
      g.fillRect(168, 12, 140, 80);
      g.fillRect(12, 104, 296, 84);
      g.strokeStyle = '#6366f1';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(24, 170);
      [150, 160, 130, 140, 118, 124, 112].forEach((y, i) => g.lineTo(24 + (i + 1) * 38, y));
      g.stroke();
      g.fillStyle = '#22c55e';
      [40, 60, 30, 70].forEach((h, i) => g.fillRect(186 + i * 30, 84 - h, 18, h));
    } else if (v === 4) {
      // inbox / list
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 320, 200);
      g.fillStyle = '#e0e7ff';
      g.fillRect(0, 0, 80, 200);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = i === 1 ? '#eef2ff' : '#ffffff';
        g.fillRect(84, 6 + i * 21, 232, 19);
        g.fillStyle = '#94a3b8';
        g.fillRect(92, 12 + i * 21, 60 + ((i * 29) % 120), 5);
      }
    } else {
      // video call grid
      g.fillStyle = '#111827';
      g.fillRect(0, 0, 320, 200);
      const skins = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d'];
      for (let i = 0; i < 4; i++) {
        const x = (i % 2) * 160;
        const y = Math.floor(i / 2) * 100;
        g.fillStyle = '#1f2937';
        g.fillRect(x + 4, y + 4, 152, 92);
        g.fillStyle = skins[i]!;
        g.beginPath();
        g.arc(x + 80, y + 46, 20, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x + 52, y + 70, 56, 30);
      }
    }
  });
}

/** Abstract artwork in the Grooveli palette. */
export function artTexture(seedIn: number) {
  return tex(400, 480, (g) => {
    let s = seedIn * 997 + 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.fillStyle = ['#f3ede4', '#1f2440', '#efe2d0'][seedIn % 3]!;
    g.fillRect(0, 0, 400, 480);
    const pal = ['#6a45d1', '#2f6fd6', '#f59e0b', '#e8603c', '#2a7d7a', '#f4c7b8'];
    for (let i = 0; i < 7; i++) {
      g.fillStyle = pal[Math.floor(rnd() * pal.length)]!;
      g.globalAlpha = 0.85;
      if (rnd() > 0.5) {
        g.beginPath();
        g.arc(rnd() * 400, rnd() * 480, 40 + rnd() * 110, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(rnd() * 300, rnd() * 380, 60 + rnd() * 160, 30 + rnd() * 120);
    }
    g.globalAlpha = 1;
  });
}

/** Rug pattern (border + field). */
export function rugTexture(variant: number) {
  const pal = [
    ['#2f3a5c', '#c9b48a'],
    ['#7a3b2e', '#e7d3b5'],
    ['#3c4a3e', '#d8c7a6'],
  ][variant % 3]!;
  return tex(512, 512, (g) => {
    g.fillStyle = pal[0]!;
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = pal[1]!;
    g.lineWidth = 14;
    g.strokeRect(30, 30, 452, 452);
    g.lineWidth = 4;
    g.strokeRect(62, 62, 388, 388);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
  });
}
