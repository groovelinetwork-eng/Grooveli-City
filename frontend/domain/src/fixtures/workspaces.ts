/**
 * PRIVATE organisation workspaces (members, invitations, policies, tier,
 * workflows). Never imported by public.ts / frontend/city.
 */
import type { OrganizationPrivateWorkspace, Policy } from '../types';
import { ORG_STRUCTURE } from './structure';

const COMMON_POLICIES: Policy[] = [
  { id: 'pol-leave', title: 'Leave & time off', category: 'leave', body: 'Annual leave accrues monthly. Requests need 5 working days notice except sick leave. (Synthetic policy text.)', updatedAt: '2026-06-01', acknowledgements: 0 },
  { id: 'pol-conduct', title: 'Code of conduct', category: 'conduct', body: 'We treat colleagues, candidates and customers with respect. Harassment of any kind is not tolerated. (Synthetic policy text.)', updatedAt: '2026-01-15', acknowledgements: 0 },
  { id: 'pol-remote', title: 'Hybrid & remote work', category: 'remote-work', body: 'Hybrid staff work onsite at least 2 days per week; core hours apply. (Synthetic policy text.)', updatedAt: '2026-03-10', acknowledgements: 0 },
  { id: 'pol-security', title: 'Information security', category: 'security', body: 'Use company devices, enable MFA and report incidents within 24 hours. (Synthetic policy text.)', updatedAt: '2026-08-20', acknowledgements: 0 },
];

export const WORKSPACES: OrganizationPrivateWorkspace[] = [
  {
    organizationId: 'kestrel-systems',
    tier: 'enterprise',
    ...ORG_STRUCTURE['kestrel-systems']!,
    policies: COMMON_POLICIES.map((p) => ({ ...p, id: `${p.id}-k`, acknowledgements: 18 })),
    members: [
      { id: 'mem-k-1', name: 'Ifeoma Nwosu', email: 'ifeoma@kestrel.example', roles: ['org-admin'], departmentId: 'dep-k-people', recruitingFor: [], status: 'active' },
      { id: 'mem-k-2', name: 'Daniel Mensah', email: 'daniel@kestrel.example', roles: ['hr-manager'], departmentId: 'dep-k-people', recruitingFor: [], status: 'active' },
      { id: 'mem-k-3', name: 'Zainab Bello', email: 'zainab@kestrel.example', roles: ['recruiter'], departmentId: 'dep-k-people', recruitingFor: ['dep-k-eng', 'dep-k-product'], status: 'active' },
      { id: 'mem-k-4', name: 'Chidi Okeke', email: 'chidi@kestrel.example', roles: ['payroll-officer'], departmentId: 'dep-k-people', recruitingFor: [], status: 'active' },
    ],
    invitations: [{ id: 'inv-k-1', email: 'new.recruiter@kestrel.example', roles: ['recruiter'], sentAt: '2026-11-05T10:00:00.000Z', status: 'pending' }],
    workflows: [
      { id: 'wf-k-hiring', name: 'Engineering hiring', steps: ['Screen', 'Technical interview', 'System design', 'Values interview', 'Offer'] },
      { id: 'wf-k-onboard', name: 'New starter onboarding', steps: ['Contract signed', 'Equipment', 'Accounts', 'Buddy assigned', '30-day check-in'] },
    ],
    setupChecklist: { profile: true, culture: true, policies: true, locations: true, invite: true, departments: true, roles: true, firstVacancy: true },
  },
  {
    organizationId: 'amberline-health',
    tier: 'starter',
    ...ORG_STRUCTURE['amberline-health']!,
    policies: COMMON_POLICIES.slice(0, 2).map((p) => ({ ...p, id: `${p.id}-a`, acknowledgements: 9 })),
    members: [
      { id: 'mem-a-1', name: 'Ifeoma Nwosu', email: 'ifeoma@kestrel.example', roles: ['org-admin'], departmentId: 'dep-a-admin', recruitingFor: [], status: 'active' },
      { id: 'mem-a-2', name: 'Grace Ayodele', email: 'grace@amberline.example', roles: ['hr-manager', 'recruiter'], departmentId: 'dep-a-admin', recruitingFor: ['dep-a-clinical'], status: 'active' },
    ],
    invitations: [],
    workflows: [{ id: 'wf-a-hiring', name: 'Clinical hiring', steps: ['Licence check', 'Panel interview', 'Shadow shift', 'Offer'] }],
    setupChecklist: { profile: true, culture: true, policies: true, locations: true, invite: false, departments: true, roles: false, firstVacancy: true },
  },
];

export const ORG_SETUP_STEPS: { key: string; label: string }[] = [
  { key: 'profile', label: 'Company profile' },
  { key: 'culture', label: 'Culture & values' },
  { key: 'policies', label: 'Workplace policies' },
  { key: 'locations', label: 'Locations' },
  { key: 'invite', label: 'Invite your team' },
  { key: 'departments', label: 'Departments' },
  { key: 'roles', label: 'Assign roles' },
  { key: 'firstVacancy', label: 'Publish first vacancy' },
];
