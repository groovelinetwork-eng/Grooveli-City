/**
 * Demo seed built from the frontend's own fixtures (prisma/seed/frontend-fixtures.json,
 * exported from frontend/domain/src by `pnpm seed:export`). Gives every screen
 * realistic data and one login per role.
 *
 *   SEED_PASSWORD=<password for the demo logins> pnpm --filter @grooveli/api db:seed
 *
 * Safe to re-run: every record has a fixed ID and is upserted. Dates are shifted so
 * the frontend's demo "today" becomes the real today. In production it refuses to
 * run unless SEED_CONFIRM=seed-demo-data is also set.
 */
try {
  process.loadEnvFile();
} catch {
  /* env provided by the platform */
}

import { hash } from '@node-rs/argon2';
import { OrgRole, Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Loose fixture types (the JSON is produced from frontend/domain/src/types.ts) ──
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const F = JSON.parse(readFileSync(join(__dirname, '..', '..', 'prisma', 'seed', 'frontend-fixtures.json'), 'utf8')) as Any;

const prisma = new PrismaClient();
const DAY = 86_400_000;
const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
const shiftMs = today.getTime() - Date.parse(`${F.demoToday}T00:00:00Z`);
/** Moves a fixture date/timestamp so the demo's "today" lands on the real today. */
const shift = (iso: string) => new Date(Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso) + shiftMs);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const dbRole = (r: string) => r.replace(/-/g, '_') as OrgRole;
const json = (v: unknown) => v as Prisma.InputJsonValue;
/** Pay component/structure IDs are global keys in the database, so they're made per-organisation. */
const perOrg = (id: string, orgId: string) => `${id}-${orgId}`;

const ARGON = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** The demo logins: the frontend's personas, plus a platform admin. */
const LOGINS = [
  { key: 'candidate', email: 'tolu@grooveli.example', name: 'Tolu Adebayo', type: 'candidate' as const },
  { key: 'org-admin', email: 'ifeoma@kestrel.example', name: 'Ifeoma Nwosu', type: 'organization' as const },
  { key: 'hr-manager', email: 'daniel@kestrel.example', name: 'Daniel Mensah', type: 'organization' as const },
  { key: 'recruiter', email: 'zainab@kestrel.example', name: 'Zainab Bello', type: 'organization' as const },
  { key: 'payroll-officer', email: 'chidi@kestrel.example', name: 'Chidi Okeke', type: 'organization' as const },
  { key: 'employee', email: 'kofi@kestrel.example', name: 'Kofi Asante', type: 'organization' as const },
  { key: 'amberline-hr', email: 'grace@amberline.example', name: 'Grace Ayodele', type: 'organization' as const },
  { key: 'platform-admin', email: 'admin@grooveli.example', name: 'Grooveli Platform Admin', type: 'candidate' as const },
];

function guard() {
  const env = (process.env.NODE_ENV ?? '').toLowerCase();
  // Remote = any database not on this machine. NODE_ENV alone isn't trusted: a dev .env can point at a live database.
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? '').hostname;
    } catch {
      return '';
    }
  })();
  const remote = !['localhost', '127.0.0.1', '::1', 'postgres', ''].includes(host);
  if ((env === 'production' || remote) && process.env.SEED_CONFIRM !== 'seed-demo-data') {
    throw new Error(`Refusing to seed demo data into ${remote ? `remote database ${host}` : 'production'}. Set SEED_CONFIRM=seed-demo-data if this database is meant for demo data.`);
  }
  // The local default password is only allowed for a local database.
  const pw = process.env.SEED_PASSWORD ?? (env === 'production' || remote ? '' : 'local-demo-password');
  if (pw.length < 10) throw new Error('Set SEED_PASSWORD (at least 10 characters) for the demo logins.');
  return pw;
}

async function main() {
  const password = guard();
  const loginHash = await hash(password, ARGON);
  /** Accounts that exist for realism but can't sign in (random password). */
  const noLoginHash = await hash(randomBytes(32).toString('hex'), ARGON);
  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  // ── Users ───────────────────────────────────────────────────────────────
  const userIds: Record<string, string> = {};
  for (const l of LOGINS) {
    const u = await prisma.user.upsert({
      where: { email: l.email },
      create: { id: `user-${l.key}`, email: l.email, displayName: l.name, passwordHash: loginHash, accountType: l.type, emailVerifiedAt: new Date(), onboardingComplete: true, platformRole: l.key === 'platform-admin' ? 'admin' : 'none' },
      update: { displayName: l.name, passwordHash: loginHash, emailVerifiedAt: new Date(), onboardingComplete: true, deletedAt: null, suspendedAt: null, platformRole: l.key === 'platform-admin' ? 'admin' : 'none' },
    });
    userIds[l.key] = u.id;
    bump('logins');
  }

  async function background(id: string, email: string, name: string) {
    await prisma.user.upsert({
      where: { id },
      create: { id, email, displayName: name, passwordHash: noLoginHash, accountType: 'candidate', emailVerifiedAt: new Date(), onboardingComplete: true },
      update: { displayName: name },
    });
  }

  // Candidate profile for Tolu (the candidate persona).
  const c = F.demoCandidate;
  const profileData = (p: Any) => ({
    headline: p.headline, location: p.location, gender: p.gender ?? null, yearsExperience: p.yearsExperience, orientation: p.orientation,
    personality: p.personality ? json(p.personality) : Prisma.DbNull, avatar: json(p.avatar), summary: p.summary, skills: json(p.skills),
    certifications: p.certifications, experience: json(p.experience), education: json(p.education), preferences: json(p.preferences),
    visibility: p.visibility, homeDistrict: p.homeDistrict ?? 'plaza', interests: p.interests ?? [],
  });
  await prisma.candidateProfile.upsert({ where: { userId: userIds.candidate! }, create: { userId: userIds.candidate!, ...profileData(c) }, update: profileData(c) });
  await prisma.user.update({ where: { id: userIds.candidate! }, data: { displayName: c.displayName } });

  // Talent pool → discoverable candidates (no login).
  for (const t of F.talentPool as Any[]) {
    await background(t.id, `${t.id}@grooveli.example`, t.name);
    const data = {
      headline: t.headline, location: t.location, yearsExperience: t.yearsExperience, orientation: 'employee', avatar: json(t.avatar),
      summary: '', skills: json(t.skills), certifications: t.qualifications, experience: json([]), education: json([]),
      preferences: json({ desiredRoles: [], locations: [t.location], minSalary: t.expectedSalary, workModes: t.workModes, employmentTypes: t.employmentTypes }),
      visibility: 'employers' as const,
    };
    await prisma.candidateProfile.upsert({ where: { userId: t.id }, create: { userId: t.id, ...data }, update: data });
    bump('candidates');
  }

  // Social profiles → people directory (no login).
  for (const s of F.socialProfiles as Any[]) {
    await background(s.id, `${s.id}@grooveli.example`, s.name);
    const data = { headline: s.headline, avatar: json(s.avatar), homeDistrict: s.district, interests: s.interests, preferences: json({ desiredRoles: [], locations: [], minSalary: 0, workModes: [], employmentTypes: [] }), visibility: 'public' as const };
    await prisma.candidateProfile.upsert({ where: { userId: s.id }, create: { userId: s.id, ...data }, update: data });
    bump('people');
  }

  // ── Organisations ───────────────────────────────────────────────────────
  const workspaces = new Map((F.workspaces as Any[]).map((w) => [w.organizationId, w]));
  for (const o of F.organizations as Any[]) {
    const ws = workspaces.get(o.id);
    const data = {
      name: o.name, tagline: o.tagline, logoColor: o.logoColor, logoGlyph: o.logoGlyph, industry: o.industry, district: o.district,
      description: o.description, website: o.website, size: o.size, structure: o.structure, workArrangements: o.workArrangements,
      values: o.values, culture: json(o.culture), benefits: o.benefits, headquarters: o.headquarters, verified: !!o.verified,
      tier: ws?.tier ?? 'starter', workflows: json(ws?.workflows ?? []), setupChecklist: json(ws?.setupChecklist ?? {}), leaveAllowances: json(F.leaveAllowance),
    };
    await prisma.organization.upsert({ where: { id: o.id }, create: { id: o.id, ...data }, update: data });
    bump('organizations');
  }

  // Workspaces: structure, policies, members, invitations.
  const memberEmailToLogin: Record<string, string> = Object.fromEntries(LOGINS.map((l) => [l.email, l.key]));
  for (const ws of F.workspaces as Any[]) {
    const orgId = ws.organizationId as string;
    for (const l of ws.locations as Any[]) {
      const data = { organizationId: orgId, name: l.name, city: l.city, address: l.address, headcountCapacity: l.headcountCapacity };
      await prisma.officeLocation.upsert({ where: { id: l.id }, create: { id: l.id, ...data }, update: data });
    }
    for (const d of ws.departments as Any[]) {
      const data = { organizationId: orgId, name: d.name, headEmployeeId: d.headEmployeeId, responsibilities: d.responsibilities, locationId: d.locationId };
      await prisma.department.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
    }
    for (const p of ws.policies as Any[]) {
      const data = { organizationId: orgId, title: p.title, category: p.category.replace(/-/g, '_'), body: p.body };
      await prisma.policy.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
    }
    for (const m of ws.members as Any[]) {
      const key = memberEmailToLogin[m.email];
      if (!key) continue;
      const data = { roles: (m.roles as string[]).map(dbRole), departmentId: m.departmentId, recruitingFor: m.recruitingFor, status: m.status === 'suspended' ? 'suspended' as const : 'active' as const };
      await prisma.membership.upsert({
        where: { organizationId_userId: { organizationId: orgId, userId: userIds[key]! } },
        create: { organizationId: orgId, userId: userIds[key]!, ...data },
        update: data,
      });
      bump('memberships');
    }
    for (const i of ws.invitations as Any[]) {
      await prisma.invitation.upsert({
        where: { id: i.id },
        // The token is random and never emailed: the invitation is display-only.
        create: { id: i.id, organizationId: orgId, email: i.email, roles: (i.roles as string[]).map(dbRole), tokenHash: sha256(randomBytes(32).toString('hex')), sentAt: shift(i.sentAt), expiresAt: new Date(Date.now() + 7 * DAY), invitedById: userIds['org-admin'] },
        update: {},
      });
    }
  }

  // ── Employees (HR) ──────────────────────────────────────────────────────
  for (const [orgId, list] of Object.entries(F.employees as Record<string, Any[]>)) {
    for (const e of list) {
      const persona = e.id === F.employeePersonaId;
      const data = {
        organizationId: orgId, name: persona ? 'Kofi Asante' : e.name, title: e.title, departmentId: e.departmentId, locationId: e.locationId,
        managerId: e.managerId, email: persona ? 'kofi@kestrel.example' : e.email.toLowerCase(), startDate: shift(e.startDate),
        employmentType: e.employmentType, status: e.status.replace(/-/g, '_'), avatar: json(e.avatar), publicDirectory: !!e.publicDirectory,
        emergencyContact: e.emergencyContact ?? '', userId: persona ? userIds.employee : null,
      };
      await prisma.employee.upsert({ where: { id: e.id }, create: { id: e.id, ...data }, update: data });
      for (const [i, t] of ((e.lifecycleTasks ?? []) as Any[]).entries()) {
        const td = { employeeId: e.id, phase: t.phase, label: t.label, owner: t.owner, done: !!t.done, sortOrder: i };
        await prisma.lifecycleTask.upsert({ where: { id: `${e.id}-${t.id}` }, create: { id: `${e.id}-${t.id}`, ...td }, update: td });
      }
      bump('employees');
    }
  }
  // Link the employee persona's membership to their HR record (and give them a membership if the fixture has none).
  const kestrel = 'kestrel-systems';
  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: kestrel, userId: userIds.employee! } },
    create: { organizationId: kestrel, userId: userIds.employee!, roles: ['employee', 'manager'], employeeId: F.employeePersonaId, departmentId: 'dep-k-eng' },
    update: { roles: ['employee', 'manager'], employeeId: F.employeePersonaId, departmentId: 'dep-k-eng' },
  });

  // Pay components & structures (per organisation).
  for (const orgId of workspaces.keys()) {
    for (const pc of F.payComponents as Any[]) {
      const data = { organizationId: orgId, name: pc.name, kind: pc.kind, calcType: pc.calc.type, calcValue: pc.calc.value, taxable: pc.taxable };
      await prisma.payComponent.upsert({ where: { id: perOrg(pc.id, orgId) }, create: { id: perOrg(pc.id, orgId), ...data }, update: data });
    }
    for (const cs of F.compensationStructures as Any[]) {
      const data = { organizationId: orgId, grade: cs.grade, minBase: cs.minBase, maxBase: cs.maxBase, componentIds: (cs.componentIds as string[]).map((id) => perOrg(id, orgId)) };
      await prisma.compensationStructure.upsert({ where: { id: perOrg(cs.id, orgId) }, create: { id: perOrg(cs.id, orgId), ...data }, update: data });
    }
  }

  // Compensation, attendance, leave, reviews.
  for (const [orgId, hr] of Object.entries(F.hr as Record<string, Any>)) {
    for (const comp of hr.compensation as Any[]) {
      const data = {
        organizationId: orgId, structureId: comp.structureId ? perOrg(comp.structureId, orgId) : null, baseMonthly: comp.baseMonthly,
        effectiveFrom: shift(comp.effectiveFrom), bankOnFile: !!comp.bankOnFile,
        history: json((comp.history as Any[]).map((h) => ({ ...h, date: shift(h.date).toISOString().slice(0, 10) }))),
      };
      await prisma.compensation.upsert({ where: { employeeId: comp.employeeId }, create: { employeeId: comp.employeeId, ...data }, update: data });
    }
    for (const a of hr.attendance as Any[]) {
      const date = shift(a.date);
      await prisma.attendanceEntry.upsert({
        where: { employeeId_date: { employeeId: a.employeeId, date } },
        create: { employeeId: a.employeeId, date, status: a.status, hours: a.hours },
        update: { status: a.status, hours: a.hours },
      });
      bump('attendance');
    }
    for (const l of hr.leave as Any[]) {
      const data = { organizationId: orgId, employeeId: l.employeeId, type: l.type, start: shift(l.start), end: shift(l.end), days: l.days, reason: l.reason, status: l.status, decidedByName: l.decidedBy ?? null, decidedAt: l.decidedBy ? new Date() : null };
      await prisma.leaveRequest.upsert({ where: { id: l.id }, create: { id: l.id, ...data }, update: data });
      bump('leave');
    }
    for (const r of hr.reviews as Any[]) {
      const data = { organizationId: orgId, employeeId: r.employeeId, cycle: r.cycle, reviewerName: r.reviewer, status: r.status, rating: r.rating, goals: json(r.goals), strengths: r.strengths, improvements: r.improvements };
      await prisma.performanceReview.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
      bump('reviews');
    }
  }

  // ── Jobs & recruitment ──────────────────────────────────────────────────
  for (const j of F.jobs as Any[]) {
    let closesOn = shift(j.closesOn);
    // Keep published demo jobs open for at least two weeks from seeding.
    if (j.status === 'published' && closesOn.getTime() < today.getTime() + 14 * DAY) closesOn = new Date(today.getTime() + 30 * DAY);
    const data = {
      organizationId: j.organizationId, title: j.title, department: j.department, district: j.district, location: j.location, workMode: j.workMode,
      employmentType: j.employmentType, level: j.level, minYears: j.minYears, salaryMin: j.salaryMin, salaryMax: j.salaryMax, skills: j.skills,
      requiredQualifications: j.requiredQualifications, description: j.description, responsibilities: j.responsibilities,
      postedOn: shift(j.postedOn), closesOn, status: j.status,
    };
    await prisma.job.upsert({ where: { id: j.id }, create: { id: j.id, ...data }, update: data });
    bump('jobs');
  }
  // The frontend fixtures sometimes repeat a candidate on the same job; the API forbids that, so keep the first.
  const seenPairs = new Set<string>();
  const skippedApps = new Set<string>();
  for (const a of F.applications as Any[]) {
    const pair = `${a.jobId}|${a.candidateId}`;
    if (seenPairs.has(pair)) {
      skippedApps.add(a.id);
      continue;
    }
    seenPairs.add(pair);
    const data = {
      jobId: a.jobId, candidateId: a.candidateId, candidateName: a.candidateName, status: a.status, coverLetter: a.coverLetter, fitScore: a.fitScore,
      submittedAt: shift(a.submittedAt), history: json((a.history as Any[]).map((h) => ({ ...h, at: shift(h.at).toISOString() }))),
    };
    await prisma.application.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
    bump('applications');
  }
  if (skippedApps.size) console.log(`Skipped ${skippedApps.size} duplicate application(s) in the frontend fixtures.`);
  for (const i of F.interviews as Any[]) {
    if (skippedApps.has(i.applicationId)) continue;
    const data = {
      applicationId: i.applicationId, jobId: i.jobId, candidateId: i.candidateId, candidateName: i.candidateName, scheduledAt: shift(i.scheduledAt),
      durationMin: i.durationMin, format: i.format, interviewers: i.interviewers, status: i.status, notes: i.notes, scorecard: json(i.scorecard),
    };
    await prisma.interview.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data });
  }
  const jobOrg = new Map((F.jobs as Any[]).map((j) => [j.id, j.organizationId]));
  for (const a of F.assessments as Any[]) {
    const data = { organizationId: jobOrg.get(a.jobId)!, jobId: a.jobId, title: a.title, kind: a.kind, questions: a.questions, results: json((a.results as Any[]).filter((r) => !skippedApps.has(r.applicationId))) };
    await prisma.assessment.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
  }
  for (const s of F.shortlists as Any[]) {
    const data = { organizationId: jobOrg.get(s.jobId)!, jobId: s.jobId, name: s.name, applicationIds: (s.applicationIds as string[]).filter((id) => !skippedApps.has(id)) };
    await prisma.shortlist.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }

  // ── Engagement ──────────────────────────────────────────────────────────
  for (const a of F.announcements as Any[]) {
    const data = { organizationId: a.organizationId, title: a.title, body: a.body, author: a.author, authorId: userIds['org-admin']!, audience: a.audience, departmentId: a.departmentId ?? null, pinned: !!a.pinned, publishedAt: shift(a.publishedAt) };
    await prisma.announcement.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
  }
  for (const r of F.recognition as Any[]) {
    const data = { organizationId: r.organizationId, fromUserId: userIds['org-admin']!, from: r.from, toEmployeeId: r.toEmployeeId, value: r.value, message: r.message, at: shift(r.at) };
    await prisma.recognition.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  for (const s of F.surveys as Any[]) {
    // Questions only: fixture answers use a 0–10 scale, the API uses 1–5, so responses start empty.
    const data = { organizationId: s.organizationId, title: s.title, status: s.status, anonymous: !!s.anonymous, questions: json(s.questions), closesOn: new Date(Math.max(shift(s.closesOn).getTime(), today.getTime() + 14 * DAY)) };
    await prisma.survey.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }
  for (const f of F.feedback as Any[]) {
    const data = { organizationId: f.organizationId, category: f.category, body: f.body, status: f.status, anonymous: !!f.anonymous, at: shift(f.at), ...(f.anonymous ? { authorId: null, authorName: null } : { authorId: userIds.employee!, authorName: 'Kofi Asante' }) };
    await prisma.feedbackItem.upsert({ where: { id: f.id }, create: { id: f.id, ...data }, update: data });
  }
  for (const a of F.activities as Any[]) {
    const data = { organizationId: a.organizationId, title: a.title, date: shift(a.date), location: a.location, kind: a.kind };
    await prisma.teamActivity.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
  }
  for (const i of F.initiatives as Any[]) {
    const data = { organizationId: i.organizationId, title: i.title, owner: i.owner, progress: i.progress, status: i.status };
    await prisma.cultureInitiative.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data });
  }

  // ── City events & communities ───────────────────────────────────────────
  for (const e of F.events as Any[]) {
    let start = shift(e.start);
    let end = shift(e.end);
    // Past demo events are moved into the coming fortnight so the city has upcoming events.
    if (end.getTime() < Date.now()) {
      const len = end.getTime() - start.getTime();
      start = new Date(start.getTime() + 14 * DAY);
      end = new Date(start.getTime() + len);
    }
    const data = {
      title: e.title, kind: e.kind, district: e.district, venue: e.venue, start, end, host: e.host, hostOrganizationId: e.hostOrganizationId ?? null,
      description: e.description, capacity: e.capacity, tags: e.tags, communityId: e.communityId ?? null, createdById: userIds['platform-admin']!, cancelledAt: null,
    };
    await prisma.cityEvent.upsert({ where: { id: e.id }, create: { id: e.id, ...data }, update: data });
    bump('events');
  }
  const authorIds = new Map<string, string>();
  for (const c of F.communities as Any[]) {
    const data = { name: c.name, description: c.description, topic: c.topic, district: c.district, archivedAt: null };
    await prisma.community.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
    for (const [i, p] of (c.posts as Any[]).entries()) {
      // Post authors become (no-login) accounts so moderation and blocking work on them.
      let authorId = authorIds.get(p.author);
      if (!authorId) {
        authorId = `author-${p.author.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
        await background(authorId, `${authorId}@grooveli.example`, p.author);
        authorIds.set(p.author, authorId);
      }
      const id = `${c.id}-${p.id ?? i}`;
      const pd = { communityId: c.id, authorId, authorName: p.author, text: p.text, createdAt: shift(p.at), removedAt: null };
      await prisma.communityPost.upsert({ where: { id }, create: { id, ...pd }, update: pd });
      await prisma.communityMember.upsert({ where: { communityId_userId: { communityId: c.id, userId: authorId } }, create: { communityId: c.id, userId: authorId }, update: {} });
    }
    bump('communities');
  }
  // The candidate persona belongs to a couple of communities so "joined" states show.
  for (const c of (F.communities as Any[]).slice(0, 2)) {
    await prisma.communityMember.upsert({ where: { communityId_userId: { communityId: c.id, userId: userIds.candidate! } }, create: { communityId: c.id, userId: userIds.candidate! }, update: {} });
  }

  console.log('\nSeeded:', counts);
  console.log('\nDemo logins (all use the SEED_PASSWORD you set):');
  for (const l of LOGINS) console.log(`  ${l.key.padEnd(16)} ${l.email}`);
  console.log('\nCareer content (missions, courses, challenges) is loaded separately with `pnpm db:content`.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
