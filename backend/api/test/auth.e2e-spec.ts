import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp, ORIGIN, signUp, testEmail } from './helpers';

const API = '/api/v1';

describe('Step 1 — auth and guards (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('signs up with a secure session cookie and returns the session', async () => {
    const email = testEmail();
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/signup`)
      .set('Origin', ORIGIN)
      .send({ name: 'New User', email, password: 'Test-Password-123', accountType: 'candidate' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ user: { email, emailVerified: false }, memberships: [], activeOrganizationId: null });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/grooveli_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('validates sign-up input and rejects duplicates without revealing the account', async () => {
    const server = request(app.getHttpServer());
    const bad = await server.post(`${API}/auth/signup`).set('Origin', ORIGIN).send({ name: '', email: 'x', password: 'short', accountType: 'admin' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['accountType', 'email', 'name', 'password']);
    const { email } = await signUp(app);
    const dup = await server.post(`${API}/auth/signup`).set('Origin', ORIGIN).send({ name: 'X', email: email.toUpperCase(), password: 'Test-Password-123', accountType: 'candidate' });
    expect(dup.status).toBe(409);
  });

  it('logs in case-insensitively, rejects wrong passwords, logs out server-side', async () => {
    const { email } = await signUp(app);
    const agent = request.agent(app.getHttpServer());
    expect((await agent.post(`${API}/auth/login`).set('Origin', ORIGIN).send({ email, password: 'wrong-password' })).status).toBe(401);
    const login = await agent.post(`${API}/auth/login`).set('Origin', ORIGIN).send({ email: email.toUpperCase(), password: 'Test-Password-123' });
    expect(login.status).toBe(200);
    expect((await agent.get(`${API}/auth/session`)).status).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    await agent.post(`${API}/auth/logout`).set('Origin', ORIGIN);
    // The old cookie value no longer works even if replayed.
    expect((await request(app.getHttpServer()).get(`${API}/auth/session`).set('Cookie', cookie)).status).toBe(401);
  });

  it('locks the account after repeated failures', async () => {
    const { email } = await signUp(app);
    const server = request(app.getHttpServer());
    for (let i = 0; i < 10; i++) await server.post(`${API}/auth/login`).set('Origin', ORIGIN).send({ email, password: 'wrong-password' });
    const locked = await server.post(`${API}/auth/login`).set('Origin', ORIGIN).send({ email, password: 'Test-Password-123' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');
  });

  it('blocks state-changing requests from other origins', async () => {
    const { agent } = await signUp(app);
    const res = await agent.post(`${API}/auth/logout`).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect((await agent.get(`${API}/auth/session`)).status).toBe(200);
  });

  it('only switches to organisations the user belongs to, and accepts invitations for their email only', async () => {
    const { agent, email, userId } = await signUp(app);
    const org = await prisma.organization.create({ data: { name: 'Invite Org' } });
    expect((await agent.put(`${API}/auth/session/active-organization`).set('Origin', ORIGIN).send({ organizationId: org.id })).status).toBe(403);

    const { createHash } = await import('node:crypto');
    const hash = (t: string) => createHash('sha256').update(t).digest('hex');
    const wrongToken = 'wrong-recipient-token-0001';
    const rightToken = 'right-recipient-token-0001';
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.invitation.create({ data: { organizationId: org.id, email: 'someone.else@example.test', roles: ['recruiter'], tokenHash: hash(wrongToken), expiresAt } });
    await prisma.invitation.create({ data: { organizationId: org.id, email, roles: ['recruiter'], tokenHash: hash(rightToken), expiresAt } });

    expect((await agent.post(`${API}/invitations/${wrongToken}/accept`).set('Origin', ORIGIN)).status).toBe(403);
    const ok = await agent.post(`${API}/invitations/${rightToken}/accept`).set('Origin', ORIGIN);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ activeOrganizationId: org.id, memberships: [{ organizationId: org.id, roles: ['recruiter'] }] });
    expect((await agent.post(`${API}/invitations/${rightToken}/accept`).set('Origin', ORIGIN)).status).toBe(409);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'member.joined', actorId: userId } });
    expect(audit?.organizationId).toBe(org.id);
  });

  it('refuses to delete the last org-admin, otherwise deletes and signs out', async () => {
    const { agent, userId } = await signUp(app);
    const org = await prisma.organization.create({ data: { name: 'Solo Org' } });
    await prisma.membership.create({ data: { organizationId: org.id, userId, roles: ['org_admin'] } });
    const refused = await agent.delete(`${API}/me/account`).set('Origin', ORIGIN).send({ password: 'Test-Password-123' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('NOT_ALLOWED_IN_STATE');

    const other = await signUp(app);
    expect((await other.agent.delete(`${API}/me/account`).set('Origin', ORIGIN).send({ password: 'nope' })).status).toBe(400);
    expect((await other.agent.delete(`${API}/me/account`).set('Origin', ORIGIN).send({ password: 'Test-Password-123' })).status).toBe(200);
    expect((await other.agent.get(`${API}/auth/session`)).status).toBe(401);
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Origin', ORIGIN).send({ email: other.email, password: 'Test-Password-123' });
    expect(login.status).toBe(401);
  });

  it('reports readiness of the database and storage', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/health/ready`);
    expect(res.status).toBe(200);
    expect(res.body.data.checks).toEqual({ database: 'ok', storage: 'ok' });
  });
});
