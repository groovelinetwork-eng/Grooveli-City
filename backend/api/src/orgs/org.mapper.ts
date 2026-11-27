import type { Department, Invitation, Membership, OfficeLocation, Organization, Policy, User } from '@prisma/client';
import { toApiRole } from '../auth/permissions';
import { isoDate } from '../common/pagination';

const CULTURE_KEYS = ['environment', 'leadership', 'collaboration', 'development', 'inclusion', 'workLife'] as const;

export function toApiOrgProfile(o: Organization) {
  const culture = (o.culture ?? {}) as Record<string, string>;
  return {
    id: o.id,
    name: o.name,
    tagline: o.tagline,
    logoColor: o.logoColor,
    logoGlyph: o.logoGlyph,
    industry: o.industry,
    district: o.district,
    description: o.description,
    website: o.website,
    size: o.size,
    structure: o.structure,
    workArrangements: o.workArrangements,
    values: o.values,
    culture: Object.fromEntries(CULTURE_KEYS.map((k) => [k, culture[k] ?? ''])) as Record<(typeof CULTURE_KEYS)[number], string>,
    benefits: o.benefits,
    headquarters: o.headquarters,
    verified: o.verified,
  };
}

export const toApiLocation = (l: OfficeLocation) => ({ id: l.id, name: l.name, city: l.city, address: l.address, headcountCapacity: l.headcountCapacity });

export const toApiDepartment = (d: Department) => ({
  id: d.id, name: d.name, headEmployeeId: d.headEmployeeId, responsibilities: d.responsibilities, locationId: d.locationId,
});

export const toApiPolicyCategory = (c: Policy['category']) => c.replace(/_/g, '-');
export const toDbPolicyCategory = (c: string) => c.replace(/-/g, '_') as Policy['category'];

export const toApiPolicy = (p: Policy, acknowledgements: number) => ({
  id: p.id, title: p.title, category: toApiPolicyCategory(p.category), body: p.body, updatedAt: isoDate(p.updatedAt), acknowledgements,
});

export const toApiMember = (m: Membership & { user: Pick<User, 'displayName' | 'email'> }) => ({
  id: m.id,
  name: m.user.displayName,
  email: m.user.email,
  roles: m.roles.map(toApiRole),
  departmentId: m.departmentId,
  recruitingFor: m.recruitingFor,
  status: m.status as 'active' | 'suspended' | 'invited',
});

export const toApiInvitation = (i: Invitation) => ({
  id: i.id,
  email: i.email,
  roles: i.roles.map(toApiRole),
  sentAt: i.sentAt.toISOString(),
  status: i.status === 'pending' && i.expiresAt <= new Date() ? 'expired' : i.status,
});
