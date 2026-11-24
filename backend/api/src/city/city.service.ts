import { HttpStatus, Injectable } from '@nestjs/common';
import type { Organization } from '@prisma/client';
import { DEFAULT_AVATAR } from '../candidate/profile';
import { progressFromXp, XpService } from '../career/xp.service';
import { ApiError } from '../common/api-exception.filter';
import { isoDate, todayUtc } from '../common/pagination';
import { toApiOrgProfile } from '../orgs/org.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';

const WORLD_TTL_MS = 60_000;
const MAX_HQS = 300;
const UPCOMING_EVENTS = 50;

/**
 * Public data for the 3D city. Everything here is safe for anonymous guests:
 * no emails, no private HR data, only opted-in directory entries and
 * announcements marked public-hq.
 */
@Injectable()
export class CityService {
  private worldCache: { at: number; data: unknown } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly social: SocialService,
    private readonly xp: XpService,
  ) {}

  private async projections(orgs: Organization[]) {
    const ids = orgs.map((o) => o.id);
    const [jobs, departments, directory, announcements] = await Promise.all([
      this.prisma.job.findMany({
        where: { organizationId: { in: ids }, status: 'published', closesOn: { gte: todayUtc() } },
        orderBy: { postedOn: 'desc' },
        select: { id: true, organizationId: true, title: true, department: true, workMode: true, employmentType: true, postedOn: true },
      }),
      this.prisma.department.findMany({ where: { organizationId: { in: ids } }, select: { id: true, organizationId: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.employee.findMany({
        where: { organizationId: { in: ids }, publicDirectory: true, status: { not: 'exited' } },
        select: { organizationId: true, name: true, title: true, departmentId: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.announcement.findMany({ where: { organizationId: { in: ids }, audience: 'public-hq' }, orderBy: { publishedAt: 'desc' } }),
    ]);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    return orgs.map((o) => {
      const p = toApiOrgProfile(o);
      return {
        organization: {
          id: p.id, name: p.name, tagline: p.tagline, logoColor: p.logoColor, logoGlyph: p.logoGlyph, industry: p.industry, district: p.district,
          description: p.description, website: p.website, values: p.values, culture: p.culture, benefits: p.benefits,
          workArrangements: p.workArrangements, size: p.size, verified: p.verified,
        },
        vacancies: jobs.filter((j) => j.organizationId === o.id).slice(0, 50).map((j) => ({ id: j.id, title: j.title, department: j.department, workMode: j.workMode, employmentType: j.employmentType, postedOn: isoDate(j.postedOn) })),
        departments: departments.filter((d) => d.organizationId === o.id).map((d) => d.name),
        directory: directory.filter((e) => e.organizationId === o.id).slice(0, 200).map((e) => ({ name: e.name, title: e.title, department: deptName.get(e.departmentId) ?? '' })),
        announcements: announcements.filter((a) => a.organizationId === o.id).slice(0, 10).map((a) => ({ id: a.id, title: a.title, body: a.body, publishedAt: a.publishedAt.toISOString() })),
      };
    });
  }

  async world() {
    if (this.worldCache && Date.now() - this.worldCache.at < WORLD_TTL_MS) return this.worldCache.data;
    const [orgs, events, jobCounts] = await Promise.all([
      this.prisma.organization.findMany({ where: { deletedAt: null }, orderBy: [{ verified: 'desc' }, { name: 'asc' }], take: MAX_HQS }),
      this.social.events({}, { page: 1, pageSize: UPCOMING_EVENTS }),
      this.prisma.job.groupBy({ by: ['district'], where: { status: 'published', closesOn: { gte: todayUtc() }, organization: { deletedAt: null } }, _count: { _all: true } }),
    ]);
    const data = {
      hqs: await this.projections(orgs),
      events: events.items,
      jobCounts: Object.fromEntries(jobCounts.map((j) => [j.district, j._count._all])),
    };
    this.worldCache = { at: Date.now(), data };
    return data;
  }

  async hq(orgId: string) {
    const org = await this.prisma.organization.findFirst({ where: { id: orgId, deletedAt: null } });
    if (!org) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Organisation not found');
    return (await this.projections([org]))[0];
  }

  async me(userId?: string) {
    if (!userId) return null;
    const [user, total] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { candidateProfile: { select: { avatar: true } } } }),
      this.xp.totalXp(userId),
    ]);
    const p = progressFromXp(total);
    return {
      displayName: user.displayName,
      level: p.level,
      levelProgress: p.xpForNextLevel ? Math.round((p.xpIntoLevel / p.xpForNextLevel) * 1000) / 1000 : 0,
      avatar: (user.candidateProfile?.avatar as object) ?? DEFAULT_AVATAR,
    };
  }
}
