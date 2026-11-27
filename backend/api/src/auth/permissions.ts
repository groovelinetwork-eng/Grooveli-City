import type { OrgModule as DbModule, OrgRole as DbRole, SubscriptionTier } from '@prisma/client';

/**
 * Server-side role → permission matrix. This is the enforcement point.
 * It mirrors frontend/domain/src/permissions.ts (which is UX only).
 */
export type ApiRole = 'org-admin' | 'hr-manager' | 'recruiter' | 'payroll-officer' | 'manager' | 'employee';
export type Permission =
  | 'org.settings.manage' | 'org.members.manage' | 'org.billing.view'
  | 'recruitment.view' | 'recruitment.manage'
  | 'hr.directory.view' | 'hr.records.manage' | 'hr.leave.approve' | 'hr.performance.manage' | 'hr.policies.manage'
  | 'payroll.view' | 'payroll.prepare'
  | 'engagement.manage' | 'engagement.participate'
  | 'analytics.view' | 'self.service';

export const ROLE_PERMISSIONS: Record<ApiRole, readonly Permission[]> = {
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

export const DEFAULT_TIER_MODULES: Record<SubscriptionTier, DbModule[]> = {
  starter: ['recruitment', 'hr'],
  growth: ['recruitment', 'hr', 'payroll', 'engagement'],
  enterprise: ['recruitment', 'hr', 'payroll', 'engagement', 'analytics'],
};

// Prisma enum names use underscores; the API uses hyphens.
export const toApiRole = (r: DbRole): ApiRole => r.replace(/_/g, '-') as ApiRole;
export const toDbRole = (r: ApiRole): DbRole => r.replace(/-/g, '_') as DbRole;

export const permissionsFor = (roles: DbRole[]) => new Set(roles.flatMap((r) => ROLE_PERMISSIONS[toApiRole(r)]));
