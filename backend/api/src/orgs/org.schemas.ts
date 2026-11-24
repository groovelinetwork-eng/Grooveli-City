import { z } from 'zod';
import { zEmail, zId } from '../common/zod';

export const DISTRICTS = ['plaza', 'corporate', 'recruitment', 'university', 'tech', 'creative', 'healthcare', 'hospitality', 'finance', 'apartment', 'ai-center'] as const;
export const zDistrict = z.enum(DISTRICTS);
export const zRole = z.enum(['org-admin', 'hr-manager', 'recruiter', 'payroll-officer', 'manager', 'employee']);
export const zRoles = z.array(zRole).min(1).max(6).refine((r) => new Set(r).size === r.length, 'Roles must be unique');
export const zTier = z.enum(['starter', 'growth', 'enterprise']);
export const zModule = z.enum(['recruitment', 'hr', 'payroll', 'engagement', 'analytics']);
export const zWorkMode = z.enum(['remote', 'hybrid', 'onsite']);
export const zPolicyCategory = z.enum(['leave', 'conduct', 'remote-work', 'benefits', 'security', 'other']);
const text = (max: number) => z.string().trim().max(max);

const Culture = z
  .object({
    environment: text(1000), leadership: text(1000), collaboration: text(1000),
    development: text(1000), inclusion: text(1000), workLife: text(1000),
  })
  .strict();

export const ProfileFields = z
  .object({
    name: z.string().trim().min(1).max(100),
    tagline: text(140),
    logoColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a #RRGGBB colour'),
    logoGlyph: text(4),
    industry: text(60),
    district: zDistrict,
    description: text(5000),
    website: z.union([z.literal(''), z.string().trim().url().max(300).refine((u) => /^https?:\/\//.test(u), 'Use an http(s) URL')]),
    size: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']),
    structure: text(200),
    workArrangements: z.array(zWorkMode).max(3),
    values: z.array(text(60)).max(12),
    culture: Culture,
    benefits: z.array(text(120)).max(30),
    headquarters: text(120),
  })
  .strict();

export const ProfilePatch = ProfileFields.partial().refine((v) => Object.keys(v).length > 0, 'Send at least one field');

export const LocationInput = z
  .object({ name: z.string().trim().min(1).max(80), city: text(60), address: text(200), headcountCapacity: z.number().int().min(0).max(1_000_000) })
  .strict();

export const DepartmentInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    headEmployeeId: zId.nullable(),
    responsibilities: text(1000),
    locationId: zId.nullable(),
  })
  .strict();

export const PolicyInput = z
  .object({ title: z.string().trim().min(1).max(120), category: zPolicyCategory, body: z.string().trim().min(1).max(20000) })
  .strict();

export const InvitationCreate = z.object({ email: zEmail, roles: zRoles }).strict();

export const OrganizationInput = z
  .object({
    profile: ProfileFields.extend({ district: zDistrict.optional() }),
    locations: z.array(LocationInput).max(50),
    departments: z.array(z.object({ name: z.string().trim().min(1).max(80), responsibilities: text(1000) }).strict()).max(100),
    policies: z.array(PolicyInput).max(50),
    invites: z.array(InvitationCreate).max(50),
    tier: zTier,
  })
  .strict()
  .refine((o) => new Set(o.departments.map((d) => d.name.toLowerCase())).size === o.departments.length, {
    message: 'Department names must be unique',
    path: ['departments'],
  })
  .refine((o) => new Set(o.invites.map((i) => i.email)).size === o.invites.length, { message: 'Invite each email once', path: ['invites'] });

export const WorkspacePatch = z
  .object({
    workflows: z
      .array(z.object({ id: z.string().min(1).max(64), name: z.string().trim().min(1).max(80), steps: z.array(text(120)).max(20) }).strict())
      .max(50),
    setupChecklist: z.record(z.string().max(64), z.boolean()).refine((r) => Object.keys(r).length <= 50, 'Up to 50 items'),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field');
