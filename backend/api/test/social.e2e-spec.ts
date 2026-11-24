import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp, ORIGIN, PROFILE, signUp } from './helpers';

const API = '/api/v1';
type Agent = ReturnType<typeof request.agent>;
type U = { agent: Agent; userId: string; email: string };
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('Step 5 — social, messages, moderation, city (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let staff: U;
  let ada: U;
  let bola: U;
  let chi: U;
  let communityId: string;
  let eventId: string;
  const send = (agent: Agent, method: 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => agent[method](`${API}${url}`).set('Origin', ORIGIN).send(body);

  async function person(name: string) {
    const u = await signUp(app, { name });
    const onboarded = await send(u.agent, 'post', '/me/onboarding', { ...PROFILE, displayName: name, homeDistrict: 'tech', interests: ['AI'] });
    expect(onboarded.status).toBe(200);
    return u;
  }

  beforeAll(async () => {
    app = await createApp();
    staff = await signUp(app, { name: 'Trust & Safety' });
    await prisma.user.update({ where: { id: staff.userId }, data: { platformRole: 'admin' } });
    ada = await person('Ada Social');
    bola = await person('Bola Social');
    chi = await person('Chi Private');
    expect((await send(chi.agent, 'patch', '/me/privacy', { profileDiscoverable: false })).status).toBe(200);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('platform content', () => {
    it('only platform admins create communities and events', async () => {
      expect((await send(ada.agent, 'post', '/platform/communities', { name: 'Builders', description: '', topic: 'Tech', district: 'tech' })).status).toBe(403);
      const c = await send(staff.agent, 'post', '/platform/communities', { name: 'Builders', description: 'Makers in tech', topic: 'Tech', district: 'tech' });
      expect(c.status).toBe(201);
      communityId = c.body.data.id;
      expect((await send(staff.agent, 'post', '/platform/events', { title: 'x', kind: 'meetup', district: 'tech', venue: 'Hall', start: inHours(-2), end: inHours(-1), description: '', capacity: 2, tags: [], host: 'Grooveli' })).status).toBe(400);
      const e = await send(staff.agent, 'post', '/platform/events', {
        title: 'AI Meetup', kind: 'meetup', district: 'tech', venue: 'Plaza Hall', start: inHours(24), end: inHours(26),
        description: 'Talks', capacity: 2, tags: ['ai'], host: 'Grooveli', communityId,
      });
      expect(e.status).toBe(201);
      eventId = e.body.data.id;
    });
  });

  describe('events', () => {
    it('lists events publicly, enforces capacity, and hides attendees who opt out', async () => {
      const pub = await request(app.getHttpServer()).get(`${API}/social/events?district=tech`);
      expect(pub.body.data.items.map((x: { id: string }) => x.id)).toContain(eventId);

      await send(chi.agent, 'patch', '/me/privacy', { showInEventAttendees: false });
      expect((await send(ada.agent, 'put', `/me/events/${eventId}/rsvp`)).body.data).toEqual({ attending: true });
      expect((await send(ada.agent, 'put', `/me/events/${eventId}/rsvp`)).body.data).toEqual({ attending: true });
      expect((await send(chi.agent, 'put', `/me/events/${eventId}/rsvp`)).status).toBe(200);
      const full = await send(bola.agent, 'put', `/me/events/${eventId}/rsvp`);
      expect(full.status).toBe(409);
      expect(full.body.message).toMatch(/full/);

      const detail = (await ada.agent.get(`${API}/social/events/${eventId}`)).body.data;
      expect(detail.attendeeCount).toBe(2);
      expect(detail.attendees.map((a: { name: string }) => a.name)).toEqual(['Ada Social']);
      expect(detail.attendingByMe).toBe(true);
      const anon = (await request(app.getHttpServer()).get(`${API}/social/events/${eventId}`)).body.data;
      expect(anon).not.toHaveProperty('attendingByMe');

      expect((await send(chi.agent, 'delete', `/me/events/${eventId}/rsvp`)).body.data).toEqual({ attending: false });
    });

    it('lets organisations host their own events, and only theirs', async () => {
      const owner = await signUp(app, { accountType: 'organization' });
      const org = await send(owner.agent, 'post', '/orgs', {
        profile: { name: 'Host Co', tagline: '', logoColor: '#123456', logoGlyph: 'H', industry: '', district: 'tech', description: '', website: '', size: '1-10', structure: '', workArrangements: [], values: [], culture: { environment: '', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' }, benefits: [], headquarters: '' },
        locations: [], departments: [], policies: [], invites: [], tier: 'starter',
      });
      const orgId = org.body.data.organizationId;
      const ev = await send(owner.agent, 'post', `/orgs/${orgId}/events`, { title: 'Career fair', kind: 'career-fair', district: 'recruitment', venue: 'HQ', start: inHours(48), end: inHours(50), description: '', capacity: 100, tags: [] });
      expect(ev.body.data).toMatchObject({ host: 'Host Co', hostOrganizationId: orgId });
      const otherOwner = await signUp(app, { accountType: 'organization' });
      const other = await send(otherOwner.agent, 'post', '/orgs', {
        profile: { name: 'Other Host', tagline: '', logoColor: '#123456', logoGlyph: 'O', industry: '', district: 'tech', description: '', website: '', size: '1-10', structure: '', workArrangements: [], values: [], culture: { environment: '', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' }, benefits: [], headquarters: '' },
        locations: [], departments: [], policies: [], invites: [], tier: 'starter',
      });
      expect((await send(otherOwner.agent, 'patch', `/orgs/${other.body.data.organizationId}/events/${ev.body.data.id}`, { title: 'Hijack' })).status).toBe(404);
      expect((await send(owner.agent, 'delete', `/orgs/${orgId}/events/${ev.body.data.id}`)).status).toBe(200);
      expect((await request(app.getHttpServer()).get(`${API}/social/events/${ev.body.data.id}`)).status).toBe(404);
    });
  });

  describe('communities', () => {
    it('members post after content checks; authors and moderators delete', async () => {
      expect((await send(ada.agent, 'post', `/social/communities/${communityId}/posts`, { text: 'Hello' })).status).toBe(403);
      expect((await send(ada.agent, 'put', `/me/communities/${communityId}`)).body.data).toEqual({ joined: true });
      await send(bola.agent, 'put', `/me/communities/${communityId}`);
      const post = await send(ada.agent, 'post', `/social/communities/${communityId}/posts`, { text: 'Hello builders!' });
      expect(post.status).toBe(201);
      expect((await send(ada.agent, 'post', `/social/communities/${communityId}/posts`, { text: 'This has a FORBIDDENWORD in it' })).status).toBe(400);
      expect((await send(ada.agent, 'post', `/social/communities/${communityId}/posts`, { text: 'http://a.x http://b.x http://c.x' })).status).toBe(400);

      const c = (await ada.agent.get(`${API}/social/communities/${communityId}`)).body.data;
      expect(c).toMatchObject({ members: 2, joinedByMe: true });
      expect(c.posts[0]).toMatchObject({ author: 'Ada Social', text: 'Hello builders!' });

      expect((await send(bola.agent, 'delete', `/social/communities/${communityId}/posts/${post.body.data.id}`)).status).toBe(403);
      const second = await send(bola.agent, 'post', `/social/communities/${communityId}/posts`, { text: 'Second post' });
      expect((await send(staff.agent, 'delete', `/social/communities/${communityId}/posts/${second.body.data.id}`)).status).toBe(200);
      const list = (await request(app.getHttpServer()).get(`${API}/social/communities/${communityId}/posts`)).body.data;
      expect(list.items.map((p: { text: string }) => p.text)).toEqual(['Hello builders!']);
    });
  });

  describe('people, connections, invitations', () => {
    it('lists discoverable people only, excluding yourself', async () => {
      const ids = (await ada.agent.get(`${API}/social/people?pageSize=100`)).body.data.items.map((p: { id: string }) => p.id);
      expect(ids).toContain(bola.userId);
      expect(ids).not.toContain(ada.userId);
      expect(ids).not.toContain(chi.userId);
      const bolaProfile = (await ada.agent.get(`${API}/social/people?q=bola`)).body.data.items[0];
      expect(bolaProfile).toEqual({ id: bola.userId, name: 'Bola Social', headline: PROFILE.headline, district: 'tech', avatar: PROFILE.avatar, interests: ['AI'] });
    });

    it('connects when both sides ask', async () => {
      expect((await send(ada.agent, 'post', '/me/connections', { profileId: bola.userId })).body.data).toEqual({ profileId: bola.userId, status: 'pending' });
      expect((await send(ada.agent, 'post', '/me/connections', { profileId: bola.userId })).status).toBe(409);
      expect((await bola.agent.get(`${API}/me/connections`)).body.data).toEqual([{ profileId: ada.userId, status: 'pending', direction: 'received' }]);
      expect((await send(bola.agent, 'post', '/me/connections', { profileId: ada.userId })).body.data.status).toBe('connected');
      expect((await ada.agent.get(`${API}/me/connections`)).body.data[0].status).toBe('connected');
    });

    it('respects invitation settings and RSVPs on accept', async () => {
      const ev = await send(staff.agent, 'post', '/platform/events', { title: 'Workshop', kind: 'workshop', district: 'tech', venue: 'Lab', start: inHours(72), end: inHours(74), description: '', capacity: 50, tags: [], host: 'Grooveli' });
      await send(chi.agent, 'patch', '/me/privacy', { allowInvitations: 'connections' });
      expect((await send(ada.agent, 'post', `/social/events/${ev.body.data.id}/invitations`, { profileId: chi.userId })).status).toBe(403);
      const inv = await send(ada.agent, 'post', `/social/events/${ev.body.data.id}/invitations`, { profileId: bola.userId });
      expect(inv.status).toBe(201);
      expect((await send(ada.agent, 'post', `/social/events/${ev.body.data.id}/invitations`, { profileId: bola.userId })).status).toBe(409);
      const received = (await bola.agent.get(`${API}/me/invitations`)).body.data[0];
      expect(received).toMatchObject({ fromName: 'Ada Social', toName: 'Bola Social', status: 'pending', direction: 'received' });
      await send(bola.agent, 'post', `/me/invitations/${inv.body.data.invitationId}/response`, { accept: true });
      expect((await bola.agent.get(`${API}/social/events/${ev.body.data.id}`)).body.data.attendingByMe).toBe(true);
      expect((await send(bola.agent, 'post', `/me/invitations/${inv.body.data.invitationId}/response`, { accept: false })).status).toBe(409);
    });
  });

  describe('messages and blocking', () => {
    it('messages connections, deduplicates retries, tracks unread', async () => {
      const dee = await person('Dee Stranger');
      expect((await send(dee.agent, 'post', '/me/conversations', { profileId: ada.userId })).status).toBe(403);

      const conv = await send(ada.agent, 'post', '/me/conversations', { profileId: bola.userId });
      expect(conv.status).toBe(201);
      const cid = conv.body.data.id;
      expect((await send(bola.agent, 'post', '/me/conversations', { profileId: ada.userId })).body.data.id).toBe(cid);

      const m1 = await ada.agent.post(`${API}/me/conversations/${cid}/messages`).set('Origin', ORIGIN).set('Idempotency-Key', 'retry-key-0001').send({ text: 'Hi Bola' });
      const retry = await ada.agent.post(`${API}/me/conversations/${cid}/messages`).set('Origin', ORIGIN).set('Idempotency-Key', 'retry-key-0001').send({ text: 'Hi Bola' });
      expect(retry.body.data.id).toBe(m1.body.data.id);
      await send(ada.agent, 'post', `/me/conversations/${cid}/messages`, { text: 'Are you coming?' });

      const inbox = (await bola.agent.get(`${API}/me/conversations`)).body.data.items[0];
      expect(inbox).toMatchObject({ id: cid, unread: 2, lastMessagePreview: 'Are you coming?', with: { id: ada.userId, name: 'Ada Social' } });
      const page = (await bola.agent.get(`${API}/me/conversations/${cid}/messages`)).body.data;
      expect(page.items.map((m: { text: string; fromMe: boolean }) => [m.text, m.fromMe])).toEqual([['Are you coming?', false], ['Hi Bola', false]]);
      await send(bola.agent, 'post', `/me/conversations/${cid}/read`);
      expect((await bola.agent.get(`${API}/me/conversations`)).body.data.items[0].unread).toBe(0);
      expect((await dee.agent.get(`${API}/me/conversations/${cid}/messages`)).status).toBe(404);
      expect((await send(dee.agent, 'post', '/reports', { targetType: 'message', targetId: m1.body.data.id, reason: 'spam' })).status).toBe(404);
    });

    it('blocking removes the connection and stops invitations, messages and visibility both ways', async () => {
      const cid = (await bola.agent.get(`${API}/me/conversations`)).body.data.items[0].id;
      await send(bola.agent, 'put', `/me/blocks/${ada.userId}`);
      expect((await ada.agent.get(`${API}/me/connections`)).body.data).toEqual([]);
      expect((await bola.agent.get(`${API}/me/privacy`)).body.data.blockedIds).toEqual([ada.userId]);
      expect((await ada.agent.get(`${API}/social/people?pageSize=100`)).body.data.items.map((p: { id: string }) => p.id)).not.toContain(bola.userId);
      expect((await send(ada.agent, 'post', `/me/conversations/${cid}/messages`, { text: 'Hello?' })).status).toBe(409);
      expect((await send(ada.agent, 'post', '/me/connections', { profileId: bola.userId })).status).toBe(404);
      expect((await send(ada.agent, 'post', `/social/events/${eventId}/invitations`, { profileId: bola.userId })).status).toBe(403);
      expect((await ada.agent.get(`${API}/me/conversations`)).body.data.items).toEqual([]);

      await send(bola.agent, 'delete', `/me/blocks/${ada.userId}`);
      expect((await ada.agent.get(`${API}/social/people?pageSize=100`)).body.data.items.map((p: { id: string }) => p.id)).toContain(bola.userId);
    });
  });

  describe('reports and moderation', () => {
    it('removes reported posts and tells the reporter only that it was reviewed', async () => {
      const post = await send(bola.agent, 'post', `/social/communities/${communityId}/posts`, { text: 'Buy followers cheap' });
      const rep = await send(ada.agent, 'post', '/reports', { targetType: 'community-post', targetId: post.body.data.id, reason: 'spam' });
      expect(rep.status).toBe(201);
      expect((await send(ada.agent, 'post', '/reports', { targetType: 'community-post', targetId: post.body.data.id, reason: 'spam' })).body.data.reportId).toBe(rep.body.data.reportId);
      expect((await ada.agent.get(`${API}/platform/reports`)).status).toBe(403);

      const queue = (await staff.agent.get(`${API}/platform/reports?status=open`)).body.data.items;
      expect(queue.map((r: { id: string }) => r.id)).toContain(rep.body.data.reportId);
      const resolved = await send(staff.agent, 'post', `/platform/reports/${rep.body.data.reportId}/resolution`, { action: 'remove-content', note: 'Spam' });
      expect(resolved.body.data).toMatchObject({ status: 'actioned', resolution: { action: 'remove-content' } });
      expect((await send(staff.agent, 'post', `/platform/reports/${rep.body.data.reportId}/resolution`, { action: 'dismiss' })).status).toBe(409);
      const texts = (await request(app.getHttpServer()).get(`${API}/social/communities/${communityId}/posts`)).body.data.items.map((p: { text: string }) => p.text);
      expect(texts).not.toContain('Buy followers cheap');
      const note = (await ada.agent.get(`${API}/me/notifications`)).body.data.items.find((n: { title: string }) => n.title === 'Report reviewed');
      expect(note.body).not.toMatch(/Bola|remove/i);
    });

    it('suspends accounts: sessions end and sign-in is refused until lifted', async () => {
      const troll = await person('Troll Account');
      const rep = await send(ada.agent, 'post', '/reports', { targetType: 'profile', targetId: troll.userId, reason: 'harassment', details: 'Abusive DMs' });
      await send(staff.agent, 'post', `/platform/reports/${rep.body.data.reportId}/resolution`, { action: 'suspend-user' });
      expect((await troll.agent.get(`${API}/auth/session`)).status).toBe(401);
      const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Origin', ORIGIN).send({ email: troll.email, password: 'Test-Password-123' });
      expect(login.status).toBe(403);
      expect((await ada.agent.get(`${API}/social/people?q=troll`)).body.data.items).toEqual([]);
      expect((await send(staff.agent, 'put', `/platform/users/${staff.userId}/suspension`, { suspended: true })).status).toBe(409);

      await send(staff.agent, 'put', `/platform/users/${troll.userId}/suspension`, { suspended: false, note: 'Appeal accepted' });
      const again = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Origin', ORIGIN).send({ email: troll.email, password: 'Test-Password-123' });
      expect(again.status).toBe(200);
      expect(await prisma.auditLog.count({ where: { action: { in: ['user.suspended', 'user.unsuspended'] }, targetId: troll.userId } })).toBe(2);
    });
  });

  describe('city', () => {
    it('serves only public data for the world and HQs, without a session', async () => {
      const owner = await signUp(app, { name: 'HQ Owner', accountType: 'organization' });
      const created = await send(owner.agent, 'post', '/orgs', {
        profile: { name: 'Zeta Labs', tagline: 'Research', logoColor: '#654321', logoGlyph: 'Z', industry: 'Science', district: 'university', description: '', website: '', size: '11-50', structure: '', workArrangements: ['hybrid'], values: ['Curiosity'], culture: { environment: '', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' }, benefits: [], headquarters: '' },
        locations: [{ name: 'Lab', city: 'Ibadan', address: '1 UI Road', headcountCapacity: 30 }],
        departments: [{ name: 'Research', responsibilities: '' }], policies: [], invites: [], tier: 'growth',
      });
      const orgId = created.body.data.organizationId;
      const ws = (await owner.agent.get(`${API}/orgs/${orgId}/workspace`)).body.data;
      const base = { title: 'Scientist', departmentId: ws.departments[0].id, locationId: ws.locations[0].id, startDate: '2025-01-01', employmentType: 'full-time', baseMonthly: 500_000 };
      const shown = await send(owner.agent, 'post', `/orgs/${orgId}/hr/employees`, { ...base, name: 'Opted In', email: 'optin@example.test' });
      await send(owner.agent, 'patch', `/orgs/${orgId}/hr/employees/${shown.body.data.employeeId}`, { publicDirectory: true });
      await send(owner.agent, 'post', `/orgs/${orgId}/hr/employees`, { ...base, name: 'Stays Private', email: 'private@example.test' });
      await send(owner.agent, 'post', `/orgs/${orgId}/engagement/announcements`, { title: 'We are hiring', body: 'Come visit', audience: 'public-hq', pinned: false });
      await send(owner.agent, 'post', `/orgs/${orgId}/engagement/announcements`, { title: 'Internal only', body: 'Payroll date', audience: 'all', pinned: false });
      await send(owner.agent, 'post', `/orgs/${orgId}/recruitment/vacancies`, {
        title: 'Lab Assistant', department: 'Research', district: 'university', location: 'Ibadan', workMode: 'onsite', employmentType: 'full-time', level: 'entry',
        minYears: 0, salaryMin: 100_000, salaryMax: 200_000, skills: [], requiredQualifications: [], description: '', responsibilities: [],
        closesOn: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10), status: 'published',
      });

      const hq = await request(app.getHttpServer()).get(`${API}/city/hq/${orgId}`);
      expect(hq.status).toBe(200);
      expect(hq.headers['set-cookie']).toBeUndefined();
      expect(hq.body.data.directory).toEqual([{ name: 'Opted In', title: 'Scientist', department: 'Research' }]);
      expect(hq.body.data.announcements.map((a: { title: string }) => a.title)).toEqual(['We are hiring']);
      expect(hq.body.data.vacancies.map((v: { title: string }) => v.title)).toEqual(['Lab Assistant']);
      expect(hq.body.data.departments).toEqual(['Research']);
      const raw = JSON.stringify(hq.body);
      expect(raw).not.toMatch(/@example\.test|Payroll date|Stays Private|baseMonthly|tier/);

      const world = (await request(app.getHttpServer()).get(`${API}/city/world`)).body.data;
      expect(world.hqs.length).toBeGreaterThan(0);
      expect(world.events.length).toBeGreaterThan(0);
      expect(typeof world.jobCounts).toBe('object');
      expect(JSON.stringify(world)).not.toMatch(/@example\.test/);
    });

    it('returns the player summary only when signed in', async () => {
      expect((await request(app.getHttpServer()).get(`${API}/city/me`)).body.data).toBeNull();
      const me = (await ada.agent.get(`${API}/city/me`)).body.data;
      expect(me).toMatchObject({ displayName: 'Ada Social', level: 1, avatar: PROFILE.avatar });
      expect(me.levelProgress).toBeGreaterThanOrEqual(0);
    });
  });
});
