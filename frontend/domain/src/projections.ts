import { z } from 'zod';
import type {
  Announcement,
  AvatarConfig,
  EmployeeRecord,
  Job,
  OrganizationPublicProfile,
  Department,
} from './types';
import { avatarSchema } from './avatar';

/**
 * Public-safe projections: the ONLY organisation data allowed in city
 * payloads. Never include salaries, private staff details, applicants,
 * payroll, HR records, private messages or private membership data.
 */
export interface PublicVacancy {
  id: string;
  title: string;
  department: string;
  workMode: Job['workMode'];
  employmentType: Job['employmentType'];
  postedOn: string;
}

export interface PublicDirectoryEntry {
  name: string;
  title: string;
  department: string;
}

export interface PublicAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

export interface PublicHqProjection {
  organization: Pick<
    OrganizationPublicProfile,
    'id' | 'name' | 'tagline' | 'logoColor' | 'logoGlyph' | 'industry' | 'district' | 'description' | 'website' | 'values' | 'culture' | 'benefits' | 'workArrangements' | 'size' | 'verified'
  >;
  vacancies: PublicVacancy[];
  departments: string[];
  directory: PublicDirectoryEntry[];
  announcements: PublicAnnouncement[];
}

export function toPublicVacancy(job: Job): PublicVacancy {
  return {
    id: job.id,
    title: job.title,
    department: job.department,
    workMode: job.workMode,
    employmentType: job.employmentType,
    postedOn: job.postedOn,
  };
}

export function toPublicHq(args: {
  organization: OrganizationPublicProfile;
  jobs: Job[];
  departments?: Department[];
  employees?: Pick<EmployeeRecord, 'organizationId' | 'publicDirectory' | 'status' | 'name' | 'title' | 'departmentId'>[];
  announcements?: Announcement[];
}): PublicHqProjection {
  const o = args.organization;
  const deptName = new Map((args.departments ?? []).map((d) => [d.id, d.name]));
  return {
    organization: {
      id: o.id,
      name: o.name,
      tagline: o.tagline,
      logoColor: o.logoColor,
      logoGlyph: o.logoGlyph,
      industry: o.industry,
      district: o.district,
      description: o.description,
      website: o.website,
      values: [...o.values],
      culture: { ...o.culture },
      benefits: [...o.benefits],
      workArrangements: [...o.workArrangements],
      size: o.size,
      verified: o.verified,
    },
    vacancies: args.jobs.filter((j) => j.organizationId === o.id && j.status === 'published').map(toPublicVacancy),
    departments: (args.departments ?? []).map((d) => d.name),
    directory: (args.employees ?? [])
      .filter((e) => e.organizationId === o.id && e.publicDirectory && e.status !== 'exited')
      .map((e) => ({ name: e.name, title: e.title, department: deptName.get(e.departmentId) ?? '' })),
    announcements: (args.announcements ?? [])
      .filter((a) => a.organizationId === o.id && a.audience === 'public-hq')
      .map((a) => ({ id: a.id, title: a.title, body: a.body, publishedAt: a.publishedAt })),
  };
}

// ── City bridge (web → city, same-origin localStorage) ─────────────────────
export const bridgeVacancySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  title: z.string().max(120),
  department: z.string().max(80),
  workMode: z.enum(['remote', 'hybrid', 'onsite']),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship', 'freelance']),
  postedOn: z.string().max(30),
});

export const cityBridgeSchema = z.object({
  version: z.literal(1),
  displayName: z.string().max(60).nullable(),
  level: z.number().int().min(1).max(999).nullable(),
  /** Fraction (0..1) of the way to the next level; optional, additive. */
  levelProgress: z.number().min(0).max(1).nullable().optional(),
  avatar: avatarSchema.nullable(),
  /** Org-scoped public updates authored in web (vacancies / public-HQ announcements). */
  publicOrgUpdates: z
    .record(
      z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
      z.object({
        vacancies: z.array(bridgeVacancySchema).max(100),
        announcements: z
          .array(z.object({ id: z.string().max(64), title: z.string().max(140), body: z.string().max(1000), publishedAt: z.string().max(40) }))
          .max(50),
      }),
    )
    .default({}),
  updatedAt: z.string().max(40),
});

export type CityBridgePayload = z.infer<typeof cityBridgeSchema>;

export function parseCityBridge(raw: string | null): CityBridgePayload | null {
  if (!raw || raw.length > 200_000) return null;
  try {
    const parsed = cityBridgeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function makeCityBridge(args: {
  displayName: string | null;
  level: number | null;
  levelProgress?: number | null;
  avatar: AvatarConfig | null;
  publicOrgUpdates?: CityBridgePayload['publicOrgUpdates'];
  now: string;
}): CityBridgePayload {
  return cityBridgeSchema.parse({
    version: 1,
    displayName: args.displayName ? args.displayName.slice(0, 60) : null,
    level: args.level,
    levelProgress: args.levelProgress ?? null,
    avatar: args.avatar,
    publicOrgUpdates: args.publicOrgUpdates ?? {},
    updatedAt: args.now,
  });
}
