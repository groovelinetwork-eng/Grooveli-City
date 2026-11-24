import type Anthropic from '@anthropic-ai/sdk';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { WebSocket } from 'ws';
import { ASSISTANT_LLM, LlmCall } from '../src/assistant/llm';
import { MarketsService } from '../src/city/markets.service';
import { createApp, ORIGIN, PROFILE, seedOrgWithJobs, signUp } from './helpers';

const API = '/api/v1';
type Agent = ReturnType<typeof request.agent>;
type U = { agent: Agent; userId: string; email: string };
type Msg = Anthropic.Beta.BetaMessage;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A scripted stand-in for Claude: each call gets the next scripted reply (which may inspect the request). */
function scripted(steps: ((p: Anthropic.Beta.MessageCreateParamsNonStreaming) => Partial<Msg>)[]) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const llm: LlmCall = async (params) => {
    calls.push(structuredClone(params));
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
    return { id: `msg_${calls.length}`, type: 'message', role: 'assistant', model: params.model, stop_reason: 'end_turn', content: [], ...step(params) } as Msg;
  };
  /** Starts a fresh script (and call log) for the next test. */
  const reset = (...next: typeof steps) => {
    calls.length = 0;
    steps.splice(0, steps.length, ...next);
  };
  return { llm, calls, steps, reset };
}
const toolUse = (id: string, name: string, input: object): Partial<Msg> => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input } as never] });
const text = (t: string): Partial<Msg> => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t, citations: null } as never] });
const lastToolResult = (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
  const last = p.messages[p.messages.length - 1]!;
  const block = (last.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]!;
  return JSON.parse(block.content as string);
};

describe('Step 6 — assistant, markets, presence, games (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  const script = scripted([]);
  let jobs: Awaited<ReturnType<typeof seedOrgWithJobs>>;
  const send = (agent: Agent, method: 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => agent[method](`${API}${url}`).set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    app = await createApp([{ token: ASSISTANT_LLM, value: script.llm }]);
    await app.listen(0);
    jobs = await seedOrgWithJobs(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function person(name: string): Promise<U & { cookie: string }> {
    const u = await signUp(app, { name });
    await send(u.agent, 'post', '/me/onboarding', { ...PROFILE, displayName: name });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Origin', ORIGIN).send({ email: u.email, password: 'Test-Password-123' });
    return { ...u, cookie: String(login.headers['set-cookie']).split(';')[0]! };
  }

  // ── AI assistant ─────────────────────────────────────────────────────────
  describe('AI assistant', () => {
    it('runs the tool loop, never sends personal traits, and only proposes applications', async () => {
      const ada = await person('Ada Assistant');
      let profileSent: Record<string, unknown> = {};
      script.reset(
        () => toolUse('t1', 'get_my_profile', {}),
        (p) => { profileSent = lastToolResult(p); return toolUse('t2', 'search_jobs', { query: 'HR', workMode: null, employmentType: null, level: null, minSalary: null }); },
        (p) => { const found = lastToolResult(p).results.map((r: { jobId: string }) => r.jobId); return toolUse('t3', 'propose_applications', { jobIds: [...found, 'not-a-job'] }); },
        () => text('I found an HR Operations Lead role that fits you well. I have proposed it — please confirm in the app to apply.'),
      );
      const res = await send(ada.agent, 'post', '/me/assistant/messages', { text: 'Find me HR jobs and apply to the best one' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ role: 'assistant', text: expect.stringContaining('confirm') });
      expect(res.body.data.pendingApplicationJobIds).toContain(jobs.strong.id);
      expect(res.body.data.pendingApplicationJobIds).not.toContain('not-a-job');

      // Nothing was submitted.
      expect((await ada.agent.get(`${API}/me/applications`)).body.data.total).toBe(0);
      // Only job-relevant profile data reached the model.
      expect(profileSent).toMatchObject({ yearsExperience: 5, headline: PROFILE.headline });
      for (const k of ['personality', 'gender', 'photoDataUrl', 'avatar', 'displayName', 'email']) expect(profileSent).not.toHaveProperty(k);

      // The request used the current model, strict tools, caching and the safety fallback.
      const first = script.calls[0]!;
      expect(first).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], cache_control: { type: 'ephemeral' } });
      expect(first.tools!.every((t) => (t as { strict?: boolean }).strict === true)).toBe(true);

      const thread = (await ada.agent.get(`${API}/me/assistant/thread`)).body.data;
      expect(thread.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    });

    it('submits only confirmed, suggested applications', async () => {
      const bo = await person('Bo Confirm');
      script.reset(
        () => toolUse('t1', 'propose_applications', { jobIds: [jobs.strong.id] }),
        () => text('Proposed. Confirm to apply.'),
      );
      await send(bo.agent, 'post', '/me/assistant/messages', { text: 'Apply to the HR lead job' });
      const notSuggested = await send(bo.agent, 'post', '/me/assistant/confirm-applications', { jobIds: [jobs.weak.id] });
      expect(notSuggested.status).toBe(400);
      const ok = await send(bo.agent, 'post', '/me/assistant/confirm-applications', { jobIds: [jobs.strong.id] });
      expect(ok.body.data.submitted).toHaveLength(1);
      expect(ok.body.data.submitted[0]).toMatchObject({ jobId: jobs.strong.id, status: 'submitted' });
      const again = await send(bo.agent, 'post', '/me/assistant/confirm-applications', { jobIds: [jobs.strong.id] });
      expect(again.body.data).toMatchObject({ submitted: [], skipped: [{ jobId: jobs.strong.id }] });
      const stored = await prisma.application.findFirstOrThrow({ where: { candidateId: bo.userId } });
      expect(stored.source).toBe('assistant');
    });

    it('handles refusals and bad tool input gracefully, and clears the thread', async () => {
      const cy = await person('Cy Edge');
      script.reset( () => ({ stop_reason: 'refusal', content: [] }));
      const refused = await send(cy.agent, 'post', '/me/assistant/messages', { text: 'something off-topic' });
      expect(refused.body.data.text).toMatch(/can't help/);

      script.reset(
        () => toolUse('t1', 'search_jobs', { query: 123 }),
        (p) => { const last = p.messages[p.messages.length - 1]!; expect((last.content as { is_error?: boolean }[])[0]!.is_error).toBe(true); return text('Let me try that differently.'); },
      );
      expect((await send(cy.agent, 'post', '/me/assistant/messages', { text: 'jobs?' })).body.data.text).toBe('Let me try that differently.');
      await send(cy.agent, 'delete', '/me/assistant/thread');
      expect((await cy.agent.get(`${API}/me/assistant/thread`)).body.data).toEqual([]);
    });

    it('answers 503 when no Claude API key is configured', async () => {
      const off = await createApp([{ token: ASSISTANT_LLM, value: null }]);
      const u = await signUp(off);
      const res = await u.agent.post(`${API}/me/assistant/messages`).set('Origin', ORIGIN).send({ text: 'hi' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      await off.close();
    });
  });

  // ── Markets ──────────────────────────────────────────────────────────────
  describe('markets billboard', () => {
    it('serves real-provider-shaped FX quotes with change and attribution, and survives provider outages', async () => {
      const markets = app.get(MarketsService);
      await prisma.marketRate.deleteMany({});
      const day = (d: string) => Date.parse(`${d}T00:02:00Z`) / 1000;
      let calls = 0;
      let today = { usd: 1500, gbp: 1900, eur: 1600, at: day('2026-11-22') };
      markets.fetchJson = async (url) => {
        calls++;
        const base = url.split('/').pop();
        const ngn = base === 'USD' ? today.usd : base === 'GBP' ? today.gbp : today.eur;
        return { result: 'success', time_last_update_unix: today.at, rates: { NGN: ngn, USD: 1 } };
      };
      const first = await request(app.getHttpServer()).get(`${API}/city/markets`);
      expect(first.status).toBe(200);
      expect(first.body.data.quotes[0]).toMatchObject({ symbol: 'USD/NGN', price: 1500, change: 0, currency: 'NGN' });

      // Next day: bypass the 30-minute cache and check the change and chart.
      (markets as unknown as { cache: unknown }).cache = null;
      today = { usd: 1530, gbp: 1900, eur: 1600, at: day('2026-11-23') };
      const second = (await request(app.getHttpServer()).get(`${API}/city/markets`)).body.data;
      expect(second.quotes[0]).toMatchObject({ price: 1530, change: 30, changePct: 2 });
      expect(second).toMatchObject({ simulated: false, source: 'ExchangeRate-API', attribution: expect.stringContaining('Exchange Rate API') });
      expect(second.chart.points.map((p: { v: number }) => p.v)).toEqual([1500, 1530]);
      expect(second.quotes).toHaveLength(3);

      // Provider down: last stored rates are still served.
      (markets as unknown as { cache: unknown }).cache = null;
      markets.fetchJson = async () => { throw new Error('ECONNRESET'); };
      const outage = await request(app.getHttpServer()).get(`${API}/city/markets`);
      expect(outage.status).toBe(200);
      expect(outage.body.data.quotes[0].price).toBe(1530);
      expect(calls).toBe(6);
    });
  });

  // ── Presence ─────────────────────────────────────────────────────────────
  describe('presence WebSocket', () => {
    const url = () => `ws://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}${API}/realtime/presence`;

    function connect(cookie?: string, origin = ORIGIN) {
      const ws = new WebSocket(url(), { headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin } });
      const inbox: { type: string; [k: string]: unknown }[] = [];
      ws.on('message', (m) => inbox.push(JSON.parse(m.toString())));
      const opened = new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('unexpected-response', (_req, res) => reject(new Error(String(res.statusCode))));
        ws.once('error', reject);
      });
      return { ws, inbox, opened };
    }
    const update = (ws: WebSocket, x: number, status = 'exploring') => ws.send(JSON.stringify({ type: 'update', district: 'tech', position: { x, z: 0 }, status }));
    const presences = (inbox: { type: string; player?: { id: string } }[], id: string) => inbox.filter((m) => m.type === 'presence' && m.player?.id === id);

    it('requires a session and an allowed origin', async () => {
      await expect(connect().opened).rejects.toThrow('401');
      const p = await person('Origin Check');
      await expect(connect(p.cookie, 'https://evil.example').opened).rejects.toThrow('403');
    });

    it('broadcasts positions, rate-limits to 2/s, and respects visibility and blocks', async () => {
      const [a, b, hidden, friendOnly, friend, blocker] = await Promise.all([
        person('Ana Walker'), person('Ben Viewer'), person('Hana Hidden'), person('Fola Friends'), person('Femi Friend'), person('Bisi Blocker'),
      ]);
      await send(hidden.agent, 'patch', '/me/privacy', { presenceVisibility: 'hidden' });
      await send(friendOnly.agent, 'patch', '/me/privacy', { presenceVisibility: 'connections' });
      await send(friendOnly.agent, 'post', '/me/connections', { profileId: friend.userId });
      await send(friend.agent, 'post', '/me/connections', { profileId: friendOnly.userId });
      await send(blocker.agent, 'put', `/me/blocks/${a.userId}`);

      const conns = Object.fromEntries(
        await Promise.all(Object.entries({ a, b, hidden, friendOnly, friend, blocker }).map(async ([k, p]) => {
          const c = connect(p.cookie);
          await c.opened;
          return [k, c] as const;
        })),
      );
      await sleep(200);
      update(conns.a!.ws, 1);
      update(conns.a!.ws, 2); // within 500 ms: dropped
      update(conns.a!.ws, 3); // dropped
      update(conns.hidden!.ws, 5);
      update(conns.friendOnly!.ws, 7);
      conns.b!.ws.send('{"type":"teleport"}');
      await sleep(400);

      expect(presences(conns.b!.inbox as never, a.userId)).toHaveLength(1);
      expect((presences(conns.b!.inbox as never, a.userId)[0] as unknown as { player: { position: { x: number }; displayName: string } }).player).toMatchObject({ displayName: 'Ana Walker', position: { x: 1, z: 0 } });
      expect(presences(conns.b!.inbox as never, hidden.userId)).toHaveLength(0);
      expect(presences(conns.b!.inbox as never, friendOnly.userId)).toHaveLength(0);
      expect(presences(conns.friend!.inbox as never, friendOnly.userId)).toHaveLength(1);
      expect(presences(conns.blocker!.inbox as never, a.userId)).toHaveLength(0);
      expect(conns.b!.inbox.some((m) => m.type === 'error')).toBe(true);

      // Late joiners get a snapshot of who they may see.
      const late = await person('Lola Late');
      const lc = connect(late.cookie);
      await lc.opened;
      await sleep(200);
      const snap = lc.inbox.find((m) => m.type === 'snapshot') as unknown as { players: { id: string }[] };
      const ids = snap.players.map((p) => p.id);
      expect(ids).toContain(a.userId);
      expect(ids).not.toContain(hidden.userId);

      // Leaving is announced.
      conns.a!.ws.close();
      await sleep(300);
      expect(conns.b!.inbox.some((m) => m.type === 'leave' && m.id === a.userId)).toBe(true);
      for (const c of [...Object.values(conns), lc]) c.ws.close();
    });
  });

  // ── Games ────────────────────────────────────────────────────────────────
  describe('games', () => {
    it('lists games un-enveloped, all coming soon until a platform admin enables one', async () => {
      const list = await request(app.getHttpServer()).get(`${API}/games`);
      expect(list.body).toEqual({ games: ['chess', 'checkers', 'ludo', 'pool', 'puzzle'].map((id) => ({ id, availability: 'coming-soon' })) });
      const p = await person('Gamer One');
      const blocked = await send(p.agent, 'post', '/games/chess/sessions', { mode: 'invite-friend' });
      expect(blocked.status).toBe(409);
      expect((await send(p.agent, 'put', '/platform/games/chess', { availability: 'available' })).status).toBe(403);

      const staff = await signUp(app, { name: 'Games Staff' });
      await prisma.user.update({ where: { id: staff.userId }, data: { platformRole: 'admin' } });
      expect((await send(staff.agent, 'put', '/platform/games/chess', { availability: 'available' })).body.data).toEqual({ id: 'chess', availability: 'available' });
      await send(staff.agent, 'put', '/platform/games/puzzle', { availability: 'available' });
    });

    it('invite-friend sessions: connections only, invitees join, others cannot see', async () => {
      const [host, pal, stranger] = await Promise.all([person('Host Gamer'), person('Pal Gamer'), person('Stranger Gamer')]);
      const s = await send(host.agent, 'post', '/games/chess/sessions', { mode: 'invite-friend' });
      expect(s.status).toBe(201);
      expect(s.body).toMatchObject({ gameId: 'chess', status: 'waiting', players: [{ playerId: host.userId, displayName: 'Host Gamer' }] });
      const sid = s.body.sessionId;
      expect((await send(host.agent, 'post', `/games/sessions/${sid}/invitations`, { connectionId: pal.userId })).status).toBe(403);
      await send(host.agent, 'post', '/me/connections', { profileId: pal.userId });
      await send(pal.agent, 'post', '/me/connections', { profileId: host.userId });
      expect((await send(host.agent, 'post', `/games/sessions/${sid}/invitations`, { connectionId: pal.userId })).status).toBe(201);
      expect((await send(stranger.agent, 'post', `/games/sessions/${sid}/join`)).status).toBe(404);
      const joined = await send(pal.agent, 'post', `/games/sessions/${sid}/join`);
      expect(joined.body).toMatchObject({ status: 'active' });
      expect(joined.body.players).toHaveLength(2);
      expect((await stranger.agent.get(`${API}/games/sessions/${sid}`)).status).toBe(404);
      expect((await host.agent.get(`${API}/games/sessions/${sid}/result`)).status).toBe(409);
    });

    it('matchmaking pairs players; single-player games start immediately', async () => {
      const [x, y] = await Promise.all([person('Xena Match'), person('Yemi Match')]);
      const first = await send(x.agent, 'post', '/games/chess/matchmaking');
      expect(first.body.status).toBe('waiting');
      const second = await send(y.agent, 'post', '/games/chess/matchmaking');
      expect(second.body.sessionId).toBe(first.body.sessionId);
      expect(second.body.status).toBe('active');
      const solo = await send(x.agent, 'post', '/games/puzzle/sessions', { mode: 'practice' });
      expect(solo.body).toMatchObject({ gameId: 'puzzle', status: 'active' });
      expect((await send(x.agent, 'post', '/games/puzzle/sessions', { mode: 'invite-friend' })).status).toBe(400);
    });
  });
});
