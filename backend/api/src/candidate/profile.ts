import { Prisma, type CandidateProfile, type User } from '@prisma/client';
import { z } from 'zod';
import type { MatchInput } from '../jobs/matching';

// ── Validation (mirrors CandidateProfile in src/openapi/schemas.ts) ─────────
const balanced = (a: string, b: string) => z.enum([a, b, 'balanced'] as [string, string, string]);
const workMode = z.enum(['remote', 'hybrid', 'onsite']);
const employmentType = z.enum(['full-time', 'part-time', 'contract', 'internship', 'freelance']);
const styleIndex = z.number().int().min(0).max(63);
const shortText = (max: number) => z.string().trim().max(max);
const PHOTO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const ProfileFields = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    headline: shortText(140),
    location: shortText(80),
    gender: z.enum(['female', 'male', 'non-binary', 'self-describe', 'prefer-not']).nullable(),
    yearsExperience: z.number().int().min(0).max(60),
    orientation: z.enum(['employee', 'freelancer', 'entrepreneur', 'student', 'open']),
    personality: z
      .object({
        energy: balanced('introverted', 'extroverted'),
        thinking: balanced('creative', 'analytical'),
        workStyle: balanced('collaborative', 'independent'),
        outlook: balanced('adventurous', 'reserved'),
        role: balanced('leader', 'supporter'),
      })
      .strict()
      .nullable(),
    avatar: z
      .object({
        body: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        skin: styleIndex, hair: styleIndex, hairColor: styleIndex,
        outfit: styleIndex, outfitColor: styleIndex, accessory: styleIndex,
      })
      .strict(),
    photoDataUrl: z.string().max(700_000).regex(PHOTO, 'Must be a PNG, JPEG or WebP data URL').nullable(),
    summary: shortText(2000),
    skills: z.array(z.object({ name: z.string().trim().min(1).max(60), level: z.number().int().min(0).max(100) }).strict()).max(50),
    certifications: z.array(shortText(120)).max(30),
    experience: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64), title: shortText(100), company: shortText(100),
            start: shortText(10), end: shortText(10).nullable(), summary: shortText(1000),
          })
          .strict(),
      )
      .max(30),
    education: z
      .array(z.object({ id: z.string().min(1).max(64), school: shortText(120), qualification: shortText(120), year: shortText(4) }).strict())
      .max(20),
    preferences: z
      .object({
        desiredRoles: z.array(shortText(80)).max(20),
        locations: z.array(shortText(80)).max(20),
        minSalary: z.number().int().min(0),
        workModes: z.array(workMode).max(3),
        employmentTypes: z.array(employmentType).max(5),
      })
      .strict(),
    visibility: z.enum(['public', 'employers', 'private']),
    /** Social only [added]: shown on the people directory, never used for matching. */
    homeDistrict: z.enum(['plaza', 'corporate', 'recruitment', 'university', 'tech', 'creative', 'healthcare', 'hospitality', 'finance', 'apartment', 'ai-center']).optional(),
    interests: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  })
  .strict();

export const ProfileInput = ProfileFields;
export const ProfilePatch = ProfileFields.partial().refine((v) => Object.keys(v).length > 0, 'Send at least one field');
export type ProfileInput = z.infer<typeof ProfileInput>;

export const DEFAULT_AVATAR = { body: 1, skin: 0, hair: 0, hairColor: 0, outfit: 0, outfitColor: 0, accessory: 0 };
export const DEFAULT_PREFERENCES = { desiredRoles: [], locations: [], minSalary: 0, workModes: [], employmentTypes: [] };

type Skill = { name: string; level: number };
type Prefs = typeof DEFAULT_PREFERENCES & { desiredRoles: string[]; locations: string[]; workModes: string[]; employmentTypes: string[] };

/** Database row (or null before onboarding) → API CandidateProfile. */
export function toApiProfile(user: Pick<User, 'id' | 'displayName'>, p: CandidateProfile | null) {
  return {
    id: user.id,
    displayName: user.displayName,
    headline: p?.headline ?? '',
    location: p?.location ?? '',
    gender: (p?.gender ?? null) as ProfileInput['gender'],
    yearsExperience: p?.yearsExperience ?? 0,
    orientation: (p?.orientation ?? 'open') as ProfileInput['orientation'],
    personality: (p?.personality ?? null) as ProfileInput['personality'],
    avatar: (p?.avatar ?? DEFAULT_AVATAR) as ProfileInput['avatar'],
    photoDataUrl: p?.photoDataUrl ?? null,
    summary: p?.summary ?? '',
    skills: (p?.skills ?? []) as Skill[],
    certifications: p?.certifications ?? [],
    experience: (p?.experience ?? []) as ProfileInput['experience'],
    education: (p?.education ?? []) as ProfileInput['education'],
    preferences: (p?.preferences ?? DEFAULT_PREFERENCES) as Prefs,
    cvFile: p?.cvKey && p.cvName && p.cvAddedAt ? { name: p.cvName, sizeKb: p.cvSizeKb ?? 0, addedAt: p.cvAddedAt.toISOString() } : null,
    visibility: (p?.visibility ?? 'employers') as ProfileInput['visibility'],
    homeDistrict: p?.homeDistrict ?? 'plaza',
    interests: p?.interests ?? [],
  };
}
export type ApiProfile = ReturnType<typeof toApiProfile>;

/** The "profile complete" rule shared with missions and achievements. */
export function isProfileComplete(p: ApiProfile): boolean {
  return (
    p.displayName.trim().length > 1 &&
    p.headline.trim().length > 3 &&
    p.summary.trim().length > 20 &&
    p.skills.length >= 3 &&
    p.experience.length >= 1 &&
    p.preferences.desiredRoles.length >= 1
  );
}

/** Only job-relevant fields — no personality, gender or photo. */
export function toMatchInput(p: ApiProfile): MatchInput {
  return {
    skills: p.skills,
    yearsExperience: p.yearsExperience,
    expectedSalary: p.preferences.minSalary,
    workModes: p.preferences.workModes,
    employmentTypes: p.preferences.employmentTypes,
    qualifications: [...p.certifications, ...p.education.map((e) => e.qualification)],
    locations: p.preferences.locations,
  };
}

/** API fields (minus displayName/id/cvFile) → Prisma data. */
export function toDbProfile(input: Partial<ProfileInput>) {
  const { displayName: _d, personality, ...rest } = input;
  return {
    ...rest,
    ...(personality !== undefined ? { personality: personality === null ? Prisma.DbNull : personality } : {}),
  } as Record<string, unknown>;
}

export function toApiPrivacy(p: CandidateProfile | null, blockedIds: string[]) {
  return {
    presenceVisibility: p?.presenceVisibility ?? 'everyone',
    showInEventAttendees: p?.showInEventAttendees ?? true,
    allowInvitations: p?.allowInvitations ?? 'everyone',
    allowMessages: p?.allowMessages ?? 'connections',
    profileDiscoverable: p?.profileDiscoverable ?? true,
    blockedIds,
  };
}

export const PrivacyPatch = z
  .object({
    presenceVisibility: z.enum(['everyone', 'connections', 'hidden']),
    showInEventAttendees: z.boolean(),
    allowInvitations: z.enum(['everyone', 'connections', 'nobody']),
    allowMessages: z.enum(['everyone', 'connections', 'nobody']),
    profileDiscoverable: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field');
