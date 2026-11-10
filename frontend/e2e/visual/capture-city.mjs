// Visual reconstruction harness for the Grooveli City day view.
//
// Captures the running city at the reference's exact resolution (1600×722)
// and composes a side-by-side + 50% overlay comparison sheet.
//
//   node frontend/e2e/visual/capture-city.mjs [label] [url]
//
// Env: SCENE=apartment captures the apartment interior against
// refeerences/apartment-reference.png at its 1328×799 size (enters via the
// district panel). SCENE=hq enters the Kestrel Systems HQ at the same 1328×799
// viewport and compares it with the latest apartment capture (out/apt-final.png)
// for consistency; ZOOM_OUT=n presses "-" n times, PAN=dx,dy drags the view.
// SETTLE_MS adjusts the settle time.
//
// Requires the city dev server (pnpm --filter @grooveli/city dev) on :3001.
// Output: frontend/e2e/visual/out/<label>.png and <label>-compare.png
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const label = process.argv[2] ?? 'current';
const hqScene = process.env.SCENE === 'hq';
const aiScene = process.env.SCENE === 'ai';
const apartment = process.env.SCENE === 'apartment';
const url =
  process.argv[3] ??
  (apartment ? 'http://localhost:3001/city/?district=apartment' : hqScene ? 'http://localhost:3001/city/?org=kestrel-systems' : aiScene ? 'http://localhost:3001/city/?district=ai-center' : 'http://localhost:3001/city/');
const out = resolve(here, 'out');
mkdirSync(out, { recursive: true });
const reference = process.env.TOD === 'night' && !hqScene && !aiScene && !apartment
  ? resolve(root, 'refeerences/city-night-original.jpeg')
  : aiScene
  ? resolve(out, 'hq-final.png')
  : hqScene
  ? existsSync(resolve(out, 'apt-final.png'))
    ? resolve(out, 'apt-final.png')
    : resolve(root, 'refeerences/apartment-reference.png')
  : resolve(root, apartment ? 'refeerences/apartment-reference.png' : 'refeerences/city-day-original.jpeg');

const W = apartment || hqScene || aiScene ? 1328 : 1600;
const H = apartment || hqScene || aiScene ? 799 : 722;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text()));
await page.addInitScript((tod) => {
  // Deterministic capture: forced day (TOD=night for night), high quality, the reference's player identity.
  localStorage.setItem('grooveli.city-settings.v1', JSON.stringify({ quality: 'high', timeOfDay: tod, reducedMotion: false, labels: true, joystick: false }));
  localStorage.setItem(
    'grooveli.city-bridge.v1',
    JSON.stringify({
      version: 1,
      displayName: 'Inje Williams',
      level: 1,
      avatar: { body: 1, skin: 3, hair: 0, hairColor: 0, outfit: 1, outfitColor: 0, accessory: 0 },
      publicOrgUpdates: {},
      updatedAt: '2026-11-09T00:00:00.000Z',
    }),
  );
}, process.env.TOD === 'night' ? 'night' : 'day');
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 60_000 });
if (apartment) {
  await page.getByRole('button', { name: /Your Apartment/ }).first().click({ timeout: 60_000 });
  await page.getByText(/Inside Your Apartment/).waitFor({ timeout: 60_000 });
}
if (aiScene) {
  await page.getByRole('dialog').getByRole('button', { name: /AI Career Center/ }).first().click({ timeout: 60_000 });
  await page.getByText(/Inside AI Career Center/).waitFor({ timeout: 60_000 });
}
if (hqScene || aiScene) {
  if (hqScene) {
    await page.getByRole('button', { name: /Enter headquarters/ }).first().click({ timeout: 60_000 });
    await page.getByText(/Inside Kestrel Systems HQ/).waitFor({ timeout: 60_000 });
  }
  await page.waitForTimeout(4000);
  for (let i = 0; i < Number(process.env.ZOOM_OUT ?? 0); i++) await page.keyboard.press('Minus');
  if (process.env.PAN) {
    const [dx, dy] = process.env.PAN.split(',').map(Number);
    await page.mouse.move(W / 2, H / 2);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(W / 2 + (dx * k) / 8, H / 2 + (dy * k) / 8);
    await page.mouse.up();
  }
}
await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 6000));
const shot = resolve(out, `${label}.png`);
await page.screenshot({ path: shot });

// Comparison sheet: reference | capture on top, 50% overlay below (file URLs; data URIs are too slow).
const ref = pathToFileURL(reference).href;
const cap = pathToFileURL(shot).href;
const html = resolve(out, `${label}-compare.html`);
writeFileSync(html, `<!doctype html><html><body style="margin:0;background:#111;color:#eee;font:14px sans-serif">
  <div style="display:flex;gap:16px"><div><div style="padding:4px">${aiScene ? "COMPANY HQ (consistency reference)" : hqScene ? "APARTMENT (consistency reference)" : "REFERENCE"}</div><img width="${W}" height="${H}" src="${ref}"></div>
  <div><div style="padding:4px">CAPTURE — ${label}</div><img width="${W}" height="${H}" src="${cap}"></div></div>
  <div style="position:relative;width:${W}px;height:${H}px;margin-top:8px"><div style="position:absolute;z-index:2;padding:4px;background:#0008">50% OVERLAY</div>
  <img style="position:absolute;inset:0" width="${W}" height="${H}" src="${ref}">
  <img style="position:absolute;inset:0;opacity:.5" width="${W}" height="${H}" src="${cap}"></div>
</body></html>`);
const sheet = await browser.newPage({ viewport: { width: W * 2 + 16, height: H * 2 + 64 } });
await sheet.goto(pathToFileURL(html).href);
await sheet.screenshot({ path: resolve(out, `${label}-compare.png`), fullPage: true });
await browser.close();
console.log(`captured ${shot}`);
