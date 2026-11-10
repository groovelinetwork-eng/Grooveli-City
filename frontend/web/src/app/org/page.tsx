'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ORG_SETUP_STEPS, DEMO_TODAY, ROLE_LABELS, can, formatNaira } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg, useModuleEnabled, useRoles } from '@/lib/store/selectors';
import { useOrgApplications, useOrgEmployees, useOrgInterviews, useOrgJobs, useOrgId } from '@/lib/store/org-hooks';
import { Badge, Card, LinkButton, MockNotice, PageHeader, ProgressBar, Stat } from '@/components/ui/primitives';
import { OrgLogo } from '@/components/ui/avatar';
import { EnterCityButton } from '@/components/enter-city-button';

export default function OrgDashboard() {
  const { organization, workspace } = useActiveOrg();
  const roles = useRoles();
  const orgId = useOrgId();
  const jobs = useOrgJobs();
  const apps = useOrgApplications();
  const interviews = useOrgInterviews();
  const employees = useOrgEmployees();
  const leave = useDemoStore((s) => s.leave);
  const runs = useDemoStore((s) => s.payrollRuns);
  const surveys = useDemoStore((s) => s.surveys);
  const recruitOn = useModuleEnabled('recruitment');
  const payrollOn = useModuleEnabled('payroll');
  const engageOn = useModuleEnabled('engagement');
  const empIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  if (!organization || !workspace) {
    return (
      <div className="stack">
        <h1>No organisation yet</h1>
        <LinkButton href="/onboarding/organization" variant="primary">
          Create an organisation
        </LinkButton>
      </div>
    );
  }
  const open = jobs.filter((j) => j.status === 'published').length;
  const active = apps.filter((a) => !['rejected', 'withdrawn', 'hired'].includes(a.status));
  const shortlisted = apps.filter((a) => a.status === 'shortlisted').length;
  const strongMatches = active.filter((a) => a.fitScore >= 75).length;
  const today = interviews.filter((i) => i.scheduledAt.slice(0, 10) === DEMO_TODAY && i.status === 'scheduled').length;
  const pendingLeave = leave.filter((l) => empIds.has(l.employeeId) && l.status === 'pending').length;
  const lastRun = runs.find((r) => r.organizationId === orgId);
  const pulse = surveys.find((s) => s.organizationId === orgId && s.status === 'open');
  const checklistDone = ORG_SETUP_STEPS.filter((s) => workspace.setupChecklist[s.key]).length;

  return (
    <div className="stack" style={{ ['--gap' as string]: '20px' }}>
      <PageHeader
        title={organization.name}
        description={`${organization.industry} · ${workspace.tier} plan (mock) · you are ${roles.map((r) => ROLE_LABELS[r]).join(', ') || 'not a member'}`}
        actions={<EnterCityButton district={organization.district} organizationId={organization.id} label="Open virtual HQ" />}
        badge={<OrgLogo glyph={organization.logoGlyph} color={organization.logoColor} name={organization.name} />}
      />
      <MockNotice title="Synthetic workspace">All employees, applicants and figures are demo data. Permission checks shape navigation only.</MockNotice>

      {can(roles, 'recruitment.view') && recruitOn ? (
        <section aria-labelledby="rec-h">
          <h2 id="rec-h" style={{ marginBottom: 10 }}>
            Recruitment
          </h2>
          <div className="grid" style={{ ['--min' as string]: '150px' }}>
            <Stat label="Open positions" value={open} />
            <Stat label="Active candidates" value={active.length} />
            <Stat label="Strong matches (≥75% fit)" value={strongMatches} hint="Heuristic, not AI" />
            <Stat label="Shortlisted" value={shortlisted} />
            <Stat label="Interviews today" value={today} />
          </div>
        </section>
      ) : null}

      {can(roles, 'hr.directory.view') ? (
        <section aria-labelledby="hr-h">
          <h2 id="hr-h" style={{ marginBottom: 10 }}>
            People
          </h2>
          <div className="grid" style={{ ['--min' as string]: '150px' }}>
            <Stat label="Headcount" value={employees.length} />
            <Stat label="Onboarding" value={employees.filter((e) => e.status === 'onboarding').length} />
            <Stat label="On leave" value={employees.filter((e) => e.status === 'on-leave').length} />
            {can(roles, 'hr.leave.approve') ? <Stat label="Leave awaiting approval" value={pendingLeave} /> : null}
            {can(roles, 'payroll.view') && payrollOn ? (
              <Stat label="Last payroll preview" value={lastRun ? formatNaira(lastRun.totals.net, { compact: true }) : '—'} hint={lastRun ? `${lastRun.period} · simulated` : 'None yet'} />
            ) : null}
            {engageOn && pulse ? <Stat label="Pulse survey responses" value={pulse.responses.length} /> : null}
          </div>
        </section>
      ) : null}

      <div className="grid-2">
        {can(roles, 'org.settings.manage') ? (
          <Card title="Setup checklist" actions={<Badge>{checklistDone}/{ORG_SETUP_STEPS.length}</Badge>}>
            <ProgressBar value={checklistDone} max={ORG_SETUP_STEPS.length} label="Organisation setup progress" />
            <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 10, ['--gap' as string]: '4px' }}>
              {ORG_SETUP_STEPS.map((s) => (
                <li key={s.key} className="small">
                  <span aria-hidden="true">{workspace.setupChecklist[s.key] ? '✅' : '⬜'}</span> {s.label}
                  <span className="sr-only">{workspace.setupChecklist[s.key] ? ' done' : ' to do'}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card title="Quick actions">
          <div className="row">
            {can(roles, 'recruitment.manage') && recruitOn ? <LinkButton href="/org/recruitment/vacancies/new" variant="primary">Post a vacancy</LinkButton> : null}
            {can(roles, 'recruitment.view') && recruitOn ? <LinkButton href="/org/recruitment/pipeline">Review applicants</LinkButton> : null}
            {can(roles, 'hr.leave.approve') ? <LinkButton href="/org/hr/leave">Approve leave</LinkButton> : null}
            {can(roles, 'payroll.prepare') && payrollOn ? <LinkButton href="/org/payroll/run">Prepare payroll preview</LinkButton> : null}
            {can(roles, 'engagement.manage') && engageOn ? <LinkButton href="/org/engagement">Post announcement</LinkButton> : null}
            {can(roles, 'self.service') ? <LinkButton href="/org/me">My workplace</LinkButton> : null}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Need a different view? <Link href="/login?switch=1">Switch demo persona</Link>.
          </p>
        </Card>
      </div>
    </div>
  );
}
