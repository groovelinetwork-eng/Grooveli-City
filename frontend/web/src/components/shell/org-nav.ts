'use client';

import { MODULE_LABELS, can, moduleEnabled, PERMISSION_LABELS, type OrgModule, type Permission } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg, useRoles } from '@/lib/store/selectors';
import type { NavItem, NavSection } from './app-shell';

interface Spec {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  module?: OrgModule;
  exact?: boolean;
}

const SECTIONS: { title: string; items: Spec[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/org', label: 'Dashboard', icon: '🏢', exact: true },
      { href: '/org/me', label: 'My workplace', icon: '🙋', permission: 'self.service' },
    ],
  },
  {
    title: 'Recruitment',
    items: [
      { href: '/org/recruitment', label: 'Vacancies', icon: '📋', permission: 'recruitment.view', module: 'recruitment', exact: true },
      { href: '/org/recruitment/pipeline', label: 'Applicant pipeline', icon: '🧭', permission: 'recruitment.view', module: 'recruitment' },
      { href: '/org/recruitment/sourcing', label: 'Sourcing & matching', icon: '🔍', permission: 'recruitment.manage', module: 'recruitment' },
      { href: '/org/recruitment/shortlists', label: 'Shortlists', icon: '⭐', permission: 'recruitment.view', module: 'recruitment' },
      { href: '/org/recruitment/assessments', label: 'Assessments', icon: '📝', permission: 'recruitment.view', module: 'recruitment' },
      { href: '/org/recruitment/interviews', label: 'Interviews', icon: '🗓️', permission: 'recruitment.view', module: 'recruitment' },
      { href: '/org/recruitment/analytics', label: 'Recruitment analytics', icon: '📈', permission: 'recruitment.view', module: 'recruitment' },
    ],
  },
  {
    title: 'People & HR',
    items: [
      { href: '/org/people', label: 'Employee directory', icon: '👥', permission: 'hr.directory.view', module: 'hr' },
      { href: '/org/hr/lifecycle', label: 'Onboarding & offboarding', icon: '🔁', permission: 'hr.records.manage', module: 'hr' },
      { href: '/org/hr/teams', label: 'Teams & departments', icon: '🧑‍🤝‍🧑', permission: 'hr.directory.view', module: 'hr' },
      { href: '/org/hr/attendance', label: 'Attendance', icon: '🕘', permission: 'hr.records.manage', module: 'hr' },
      { href: '/org/hr/leave', label: 'Leave', icon: '🌴', permission: 'hr.leave.approve', module: 'hr' },
      { href: '/org/hr/performance', label: 'Performance & appraisals', icon: '📊', permission: 'hr.performance.manage', module: 'hr' },
      { href: '/org/hr/documents', label: 'Documents', icon: '🗂️', permission: 'hr.records.manage', module: 'hr' },
      { href: '/org/hr/policies', label: 'Policies', icon: '📚', permission: 'hr.directory.view', module: 'hr' },
    ],
  },
  {
    title: 'Payroll (preview)',
    items: [
      { href: '/org/payroll', label: 'Salary records', icon: '💼', permission: 'payroll.view', module: 'payroll', exact: true },
      { href: '/org/payroll/structures', label: 'Structures & components', icon: '🧮', permission: 'payroll.view', module: 'payroll' },
      { href: '/org/payroll/run', label: 'Payroll run preview', icon: '▶️', permission: 'payroll.prepare', module: 'payroll' },
      { href: '/org/payroll/history', label: 'History & payslips', icon: '🧾', permission: 'payroll.view', module: 'payroll' },
      { href: '/org/payroll/reports', label: 'Compensation reports', icon: '📉', permission: 'payroll.view', module: 'payroll' },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { href: '/org/engagement', label: 'Announcements', icon: '📣', permission: 'engagement.participate', module: 'engagement', exact: true },
      { href: '/org/engagement/recognition', label: 'Recognition', icon: '🙌', permission: 'engagement.participate', module: 'engagement' },
      { href: '/org/engagement/surveys', label: 'Surveys', icon: '🗳️', permission: 'engagement.participate', module: 'engagement' },
      { href: '/org/engagement/feedback', label: 'Feedback', icon: '💬', permission: 'engagement.participate', module: 'engagement' },
      { href: '/org/engagement/activities', label: 'Team activities', icon: '🎈', permission: 'engagement.participate', module: 'engagement' },
      { href: '/org/engagement/culture', label: 'Culture & satisfaction', icon: '🌱', permission: 'engagement.manage', module: 'engagement' },
    ],
  },
  {
    title: 'Intelligence',
    items: [{ href: '/org/analytics', label: 'Workforce analytics', icon: '🧠', permission: 'analytics.view', module: 'analytics' }],
  },
  {
    title: 'Administration',
    items: [
      { href: '/org/settings', label: 'Organisation profile', icon: '🏷️', permission: 'org.settings.manage' },
      { href: '/org/members', label: 'Members & roles', icon: '🔑', permission: 'org.members.manage' },
      { href: '/org/structure', label: 'Departments & locations', icon: '📍', permission: 'org.settings.manage' },
      { href: '/org/permissions', label: 'Permissions matrix', icon: '🛡️', permission: 'org.members.manage' },
      { href: '/org/subscription', label: 'Plan & modules', icon: '💳', permission: 'org.billing.view' },
      { href: '/org/hq', label: 'Virtual HQ preview', icon: '🏙️' },
    ],
  },
];

/** Role- and tier-aware org navigation. Items without permission are hidden; tier-gated items show locked. */
export function useOrgNav(): NavSection[] {
  const roles = useRoles();
  const { workspace } = useActiveOrg();
  const overrides = useDemoStore((s) => s.tierModules);
  return SECTIONS.map((section) => ({
    title: section.title,
    items: section.items.map((spec): NavItem => {
      const allowed = !spec.permission || can(roles, spec.permission);
      const enabled = !spec.module || (workspace ? moduleEnabled(workspace.tier, spec.module, overrides) : false);
      return {
        href: spec.href,
        label: spec.label,
        icon: spec.icon,
        exact: spec.exact,
        hidden: !allowed,
        locked: allowed && !enabled ? `${MODULE_LABELS[spec.module!]} is not in the ${workspace?.tier ?? 'current'} plan (mock gate)` : null,
      };
    }),
  })).filter((s) => s.items.some((i) => !i.hidden));
}

export function permissionLabel(p: Permission) {
  return PERMISSION_LABELS[p];
}
