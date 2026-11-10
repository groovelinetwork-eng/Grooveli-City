'use client';

import { useMemo } from 'react';
import { toPublicHq } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg } from '@/lib/store/selectors';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Card, InfoNotice, PageHeader } from '@/components/ui/primitives';
import { EnterCityButton } from '@/components/enter-city-button';

/** Shows exactly what the public HQ projection exposes to the city. */
export default function HqPreviewPage() {
  const { organization, workspace } = useActiveOrg();
  const jobs = useDemoStore((s) => s.jobs);
  const employees = useDemoStore((s) => s.employees);
  const announcements = useDemoStore((s) => s.announcements);
  const hq = useMemo(
    () => (organization ? toPublicHq({ organization, jobs, departments: workspace?.departments, employees, announcements }) : null),
    [organization, workspace, jobs, employees, announcements],
  );
  return (
    <OrgGate>
      {hq && organization ? (
        <>
          <PageHeader
            title="Virtual HQ preview"
            description="Your headquarters in Grooveli City shows only public-safe information."
            actions={<EnterCityButton district={organization.district} organizationId={organization.id} label="Open HQ in the city" className="btn btn-primary" />}
          />
          <div className="stack">
            <InfoNotice>
              The city receives this public projection only. Salaries, payroll, HR records, applicant details and private member data are never included.
              Employee-only areas in the HQ link back to this web workspace, where access is checked (and in production, enforced by the backend).
            </InfoNotice>
            <div className="grid-2">
              <Card title="Reception">
                <p>{hq.organization.description}</p>
                <div className="row" style={{ marginTop: 8 }}>{hq.organization.values.map((v) => <Badge key={v} tone="primary">{v}</Badge>)}</div>
              </Card>
              <Card title={`Careers board (${hq.vacancies.length})`}>
                <ul className="small" style={{ paddingLeft: 20 }}>
                  {hq.vacancies.map((v) => (
                    <li key={v.id}>
                      {v.title} · {v.workMode}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title={`Public directory (${hq.directory.length} opted in)`}>
                <ul className="small" style={{ paddingLeft: 20 }}>
                  {hq.directory.slice(0, 12).map((d) => (
                    <li key={d.name}>
                      {d.name} — {d.title}, {d.department}
                    </li>
                  ))}
                </ul>
                <p className="small muted">Only employees who opted in appear; set this on each employee record.</p>
              </Card>
              <Card title="Announcements board">
                {hq.announcements.length === 0 ? (
                  <p className="small muted">Publish an announcement with the &ldquo;Public HQ&rdquo; audience to show it here.</p>
                ) : (
                  <ul className="small" style={{ paddingLeft: 20 }}>
                    {hq.announcements.map((a) => (
                      <li key={a.id}>{a.title}</li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Departmental offices">
                <div className="row">{hq.departments.map((d) => <Badge key={d}>{d}</Badge>)}</div>
              </Card>
            </div>
            <details className="card">
              <summary style={{ cursor: 'pointer' }}>Raw public payload (JSON)</summary>
              <pre className="small" style={{ overflowX: 'auto', marginTop: 8 }}>{JSON.stringify(hq, null, 2)}</pre>
            </details>
          </div>
        </>
      ) : null}
    </OrgGate>
  );
}
