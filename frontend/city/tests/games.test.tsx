import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../src/scene/CityCanvas', async () => ({ default: (await import('./canvasStub')).CanvasStub }));

import { App } from '../src/app/App';
import { GAMES_COLLIDERS, GAME_DECKS, GAME_STATIONS, GAMES_PAVILION, LOUNGE } from '../src/world/gamesZone';
import { COLLIDERS, INTERACTABLES, INTERACT_RADIUS, PLAYER_RADIUS, ROADS, blockBounds, groundHeight, spawnPoint, type AABB } from '../src/world/layout';
import { PLAZA_RECT, PLAZA_RING } from '../src/world/plan';
import { nearestInteractable } from '../src/world/movement';
import { QUALITY, makePedestrians, pointOnLoop } from '../src/world/ambient';
import {
  GAME_CATALOGUE,
  GAME_IDS,
  HttpGamesService,
  UnavailableGamesService,
  displayAvailability,
  isPlayable,
} from '../src/services/games';
import { GamePanel, GamesHubPanel } from '../src/ui/GamesPanels';

const PLAZA_BLOCK = blockBounds({ x: 1, z: 1 });
const inside = (p: { x: number; z: number }, r: AABB, pad = 0) => p.x > r.minX - pad && p.x < r.maxX + pad && p.z > r.minZ - pad && p.z < r.maxZ + pad;
const overlap = (a: AABB, b: AABB) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

describe('Games Zone layout on Grooveli Plaza', () => {
  it('keeps the pavilion and every game deck inside the plaza block, off the roads and apart', () => {
    for (const d of GAME_DECKS) {
      expect(d.minX >= PLAZA_BLOCK.minX && d.maxX <= PLAZA_BLOCK.maxX && d.minZ >= PLAZA_BLOCK.minZ && d.maxZ <= PLAZA_BLOCK.maxZ, d.id).toBe(true);
      for (const r of ROADS.filter((x) => !x.minor)) expect(overlap(d, r), `${d.id} on a road`).toBe(false);
      for (const e of GAME_DECKS) if (e !== d) expect(overlap(d, e), `${d.id}/${e.id}`).toBe(false);
    }
    const p = GAMES_PAVILION;
    expect(inside({ x: p.x, z: p.z - p.radius }, PLAZA_RECT) && inside({ x: p.x, z: p.z + p.radius }, PLAZA_RECT)).toBe(true);
  });

  it('keeps the central lounge recognisable: ring clear of decks, pavilion and spawn kept', () => {
    for (const d of GAME_DECKS) {
      const cx = Math.max(d.minX, Math.min(PLAZA_RING.x, d.maxX));
      const cz = Math.max(d.minZ, Math.min(PLAZA_RING.z, d.maxZ));
      expect(Math.hypot(cx - PLAZA_RING.x, cz - PLAZA_RING.z)).toBeGreaterThan(PLAZA_RING.radius + 0.5);
    }
    expect(Math.hypot(GAMES_PAVILION.x - PLAZA_RING.x, GAMES_PAVILION.z - PLAZA_RING.z)).toBeGreaterThan(GAMES_PAVILION.radius + PLAZA_RING.radius - 0.4);
    const spawn = spawnPoint({});
    expect(nearestInteractable(spawn)?.id).toBe('kiosk-plaza');
    for (const c of COLLIDERS) expect(inside(spawn, c, PLAYER_RADIUS)).toBe(false);
    expect(LOUNGE.sofaRadius).toBeLessThan(PLAZA_RING.radius);
  });

  it('offers six stations (hub + five games), each reachable and announcing its own name', () => {
    const games = INTERACTABLES.filter((i) => i.kind === 'game');
    expect(games.map((g) => g.id).sort()).toEqual(['checkers', 'chess', 'games-hub', 'ludo', 'pool', 'puzzle']);
    for (const s of GAME_STATIONS) {
      for (const c of COLLIDERS) expect(inside(s.position, c, PLAYER_RADIUS), `${s.id} blocked`).toBe(false);
      expect(nearestInteractable(s.position)?.id, s.id).toBe(s.id);
      if (s.id !== 'games-hub') {
        const d = GAME_DECKS.find((x) => x.id === s.id)!;
        const cx = Math.max(d.minX, Math.min(s.position.x, d.maxX));
        const cz = Math.max(d.minZ, Math.min(s.position.z, d.maxZ));
        expect(Math.hypot(cx - s.position.x, cz - s.position.z)).toBeLessThan(INTERACT_RADIUS);
      }
    }
  });

  it('lets avatars step onto the decks and blocks walking through the furniture', () => {
    for (const d of GAME_DECKS) expect(groundHeight({ x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 })).toBeCloseTo(d.y);
    expect(GAMES_COLLIDERS.every((c) => COLLIDERS.includes(c))).toBe(true);
  });

  it('routes plaza pedestrians around the game areas', () => {
    const walkers = makePedestrians(QUALITY.high.pedestrians).filter((w) => inside({ x: w.loop.cx, z: w.loop.cz }, PLAZA_RECT));
    expect(walkers.length).toBeGreaterThan(0);
    for (const w of walkers)
      for (let s = 0; s < 60; s += 1.5) {
        const p = pointOnLoop(w.loop, w.offset + s * 7).p;
        for (const d of GAME_DECKS) expect(inside(p, d), `walker in ${d.id}`).toBe(false);
        for (const c of GAMES_COLLIDERS) expect(inside(p, c, -0.05), 'walker in furniture').toBe(false);
      }
  });
});

describe('games catalogue and service', () => {
  it('describes all five planned games', () => {
    expect([...GAME_IDS].sort()).toEqual(['checkers', 'chess', 'ludo', 'pool', 'puzzle']);
    for (const id of GAME_IDS) {
      const g = GAME_CATALOGUE[id];
      expect(g.title.length).toBeGreaterThan(2);
      expect(g.players.min).toBeLessThanOrEqual(g.players.max);
      expect(g.plannedModes.length).toBeGreaterThan(0);
    }
  });

  it('without a backend every game is "coming soon" and no session can be created', async () => {
    const s = new UnavailableGamesService();
    expect((await s.listGames()).every((l) => l.availability === 'coming-soon')).toBe(true);
    expect(await s.createSession('chess', 'invite-friend')).toMatchObject({ ok: false, reason: 'not-available' });
    expect(await s.findMatch('ludo')).toMatchObject({ ok: false });
    expect(await s.joinSession('x')).toMatchObject({ ok: false });
    expect(await s.getSession('x')).toBeNull();
  });

  it('validates the games API and never shows Play without a frontend game client', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ games: [{ id: 'chess', availability: 'available' }, { id: 'ludo', availability: 'maintenance', message: 'Back soon' }, { id: 'bogus', availability: 'available' }] })));
    vi.stubGlobal('fetch', fetchMock);
    const listings = await new HttpGamesService('/api').listGames();
    vi.unstubAllGlobals();
    // the whole payload is rejected (unknown id) → everything stays "coming soon"
    expect(listings.every((l) => l.availability === 'coming-soon')).toBe(true);
    expect(isPlayable({ id: 'chess', availability: 'available' })).toBe(false);
    expect(displayAvailability({ id: 'chess', availability: 'available' })).toBe('coming-soon');
    expect(displayAvailability({ id: 'ludo', availability: 'maintenance' })).toBe('maintenance');
  });
});

describe('games panels', () => {
  afterEach(() => localStorage.clear());

  it('shows a game honestly: description, players, "Coming soon" and no working Play button', async () => {
    const onAll = vi.fn();
    render(<GamePanel id="chess" listing={{ id: 'chess', availability: 'coming-soon' }} onClose={() => {}} onAllGames={onAll} />);
    const panel = screen.getByRole('dialog', { name: 'Chess' });
    expect(within(panel).getByText('Coming soon')).toBeInTheDocument();
    expect(within(panel).getByText(/2 players/)).toBeInTheDocument();
    expect(within(panel).getByRole('img', { name: /Chess illustration/ })).toBeInTheDocument();
    expect(within(panel).getByRole('status')).toHaveTextContent(/isn.t playable yet/);
    const play = within(panel).getByRole('button', { name: /Play/ });
    expect(play).toBeDisabled();
    await userEvent.click(within(panel).getByRole('button', { name: /All Grooveli games/ }));
    expect(onAll).toHaveBeenCalled();
  });

  it('lists all five games in the hub with their availability and opens one', async () => {
    const onSelect = vi.fn();
    render(<GamesHubPanel listings={GAME_IDS.map((id) => ({ id, availability: 'coming-soon' as const }))} onSelect={onSelect} onClose={() => {}} />);
    const cards = screen.getAllByRole('button', { name: /Coming soon/ });
    expect(cards).toHaveLength(5);
    expect(screen.getByText(/simulated decoration/)).toBeInTheDocument();
    expect(screen.getByText(/Wagering of any kind is not part of Grooveli Games/)).toBeInTheDocument();
    expect(screen.queryAllByRole('button').some((b) => /\b(bet|wager|stake)\b/i.test(b.textContent ?? ''))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /^8-Ball Pool/ }));
    expect(onSelect).toHaveBeenCalledWith('pool');
  });
});

describe('Games Hub in the city', () => {
  it('is reachable from Places: hub → game → back to all games', async () => {
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    await userEvent.keyboard('p');
    await userEvent.click(await screen.findByRole('button', { name: /Grooveli Games Hub/ }));
    const hub = screen.getByRole('dialog', { name: 'Grooveli Games Hub' });
    await userEvent.click(within(hub).getByRole('button', { name: /^Ludo/ }));
    const ludo = await screen.findByRole('dialog', { name: 'Ludo' });
    expect(within(ludo).getByText('Coming soon')).toBeInTheDocument();
    expect(within(ludo).getByRole('button', { name: /Play/ })).toBeDisabled();
    await userEvent.click(within(ludo).getByRole('button', { name: /All Grooveli games/ }));
    expect(screen.getByRole('dialog', { name: 'Grooveli Games Hub' })).toBeInTheDocument();
  });

  it('appears on the city map as a landmark that opens the hub', async () => {
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const map = screen.getByRole('dialog', { name: 'Menu' });
    const games = within(map).getByRole('button', { name: /^Grooveli Games Hub, Grooveli Plaza/ });
    games.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(within(map).getByRole('button', { name: 'Games Hub details' }));
    expect(screen.getByRole('dialog', { name: 'Grooveli Games Hub' })).toBeInTheDocument();
  });

  it('is listed in the non-3D directory on the plaza page', async () => {
    render(<App search="" webgl={false} />);
    await userEvent.click(screen.getByRole('button', { name: /Grooveli Games Hub/ }));
    expect(screen.getByRole('dialog', { name: 'Grooveli Games Hub' })).toBeInTheDocument();
  });
});
