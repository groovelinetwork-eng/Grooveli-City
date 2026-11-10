import type { OrgRole, PersonaId, SubscriptionTier } from './types';

/**
 * UX-only permission model. Frontend checks hide/guard navigation for
 * usability; they are NOT security enforcement (backend is authoritative).
 * The role matrix is a proposal pending team approval.
 */
export type Permission =
  | 'org.settings.manage'
  | 'org.members.manage'
  | 'org.billing.view'
  | 'recruitment.view'
  | 'recruitment.manage'
  | 'hr.directory.view'
  | 'hr.records.manage'
  | 'hr.leave.approve'
  | 'hr.performance.manage'
  | 'hr.policies.manage'
  | 'payroll.view'
  | 'payroll.prepare'
  | 'engagement.manage'
  | 'engagement.participate'
  | 'analytics.view'
  | 'self.service';

export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  'org-admin': [
    'org.settings.manage', 'org.members.manage', 'org.billing.view', 'recruitment.view', 'recruitment.manage',
    'hr.directory.view', 'hr.records.manage', 'hr.leave.approve', 'hr.performance.manage', 'hr.policies.manage',
    'payroll.view', 'engagement.manage', 'engagement.participate', 'analytics.view', 'self.service',
  ],
  'hr-manager': [
    'recruitment.view', 'hr.directory.view', 'hr.records.manage', 'hr.leave.approve', 'hr.performance.manage',
    'hr.policies.manage', 'payroll.view', 'engagement.manage', 'engagement.participate', 'analytics.view', 'self.service',
  ],
  recruiter: ['recruitment.view', 'recruitment.manage', 'hr.directory.view', 'engagement.participate', 'self.service'],
  'payroll-officer': ['payroll.view', 'payroll.prepare', 'hr.directory.view', 'analytics.view', 'engagement.participate', 'self.service'],
  manager: ['recruitment.view', 'hr.directory.view', 'hr.leave.approve', 'hr.performance.manage', 'engagement.participate', 'self.service'],
  employee: ['hr.directory.view', 'engagement.participate', 'self.service'],
};

export const ROLE_LABELS: Record<OrgRole, string> = {
  'org-admin': 'Organisation admin',
  'hr-manager': 'HR manager',
  recruiter: 'Recruiter',
  'payroll-officer': 'Payroll officer',
  manager: 'Line manager',
  employee: 'Employee',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'org.settings.manage': 'Manage organisation profile & settings',
  'org.members.manage': 'Invite members & assign roles',
  'org.billing.view': 'View subscription',
  'recruitment.view': 'View recruitment',
  'recruitment.manage': 'Manage vacancies & pipelines',
  'hr.directory.view': 'View employee directory',
  'hr.records.manage': 'Manage employee records',
  'hr.leave.approve': 'Approve leave',
  'hr.performance.manage': 'Manage performance reviews',
  'hr.policies.manage': 'Manage HR policies',
  'payroll.view': 'View payroll & compensation',
  'payroll.prepare': 'Prepare payroll previews',
  'engagement.manage': 'Manage engagement programmes',
  'engagement.participate': 'Participate in engagement',
  'analytics.view': 'View workforce analytics',
  'self.service': 'Employee self-service',
};

export type OrgModule = 'recruitment' | 'hr' | 'payroll' | 'engagement' | 'analytics';

export const MODULE_LABELS: Record<OrgModule, string> = {
  recruitment: 'Recruitment & talent acquisition',
  hr: 'HR operations',
  payroll: 'Payroll & compensation (preview)',
  engagement: 'Engagement & workplace experience',
  analytics: 'Workforce intelligence',
};

/** Configurable mock subscription gates — real tiers/pricing are undefined (open decision). */
export const DEFAULT_TIER_MODULES: Record<SubscriptionTier, OrgModule[]> = {
  starter: ['recruitment', 'hr'],
  growth: ['recruitment', 'hr', 'payroll', 'engagement'],
  enterprise: ['recruitment', 'hr', 'payroll', 'engagement', 'analytics'],
};

export function permissionsFor(roles: OrgRole[]): Set<Permission> {
  return new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]));
}

export function can(roles: OrgRole[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export function moduleEnabled(
  tier: SubscriptionTier,
  module: OrgModule,
  overrides?: Partial<Record<SubscriptionTier, OrgModule[]>>,
): boolean {
  return (overrides?.[tier] ?? DEFAULT_TIER_MODULES[tier]).includes(module);
}

export interface DemoPersona {
  id: PersonaId;
  label: string;
  displayName: string;
  description: string;
  home: string;
  roles: OrgRole[];
}

export const PERSONAS: DemoPersona[] = [
  { id: 'candidate', label: 'Candidate', displayName: 'Tolu Adebayo', description: 'Job seeker building a career profile', home: '/app', roles: [] },
  { id: 'org-admin', label: 'Organisation admin', displayName: 'Ifeoma Nwosu', description: 'Founding admin of Kestrel Systems (also admin at Amberline Health)', home: '/org', roles: ['org-admin'] },
  { id: 'hr-manager', label: 'HR manager', displayName: 'Daniel Mensah', description: 'Runs people operations at Kestrel Systems', home: '/org/people', roles: ['hr-manager'] },
  { id: 'recruiter', label: 'Recruiter', displayName: 'Zainab Bello', description: 'Hires for Engineering and Product', home: '/org/recruitment', roles: ['recruiter'] },
  { id: 'payroll-officer', label: 'Payroll officer', displayName: 'Chidi Okeke', description: 'Prepares simulated payroll previews', home: '/org/payroll', roles: ['payroll-officer'] },
  { id: 'employee', label: 'Employee', displayName: 'Kofi Asante', description: 'Engineering manager using self-service', home: '/org/me', roles: ['employee', 'manager'] },
];

export function getPersona(id: string): DemoPersona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
