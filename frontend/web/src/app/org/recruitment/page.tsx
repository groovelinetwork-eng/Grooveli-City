'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDate, type Job } from '@grooveli/frontend-domain';
import { useCan } from '@/lib/store/selectors';
import { useOrgApplications, useOrgJobs } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, LinkButton, PageHeader } from '@/components/ui/primitives';
import { ChoiceChips } from '@/components/ui/form';
import { DataTable } from '@/components/ui/widgets';
import { salaryRange } from '@/components/jobs/job-components';

function Vacancies() {
  const jobs = useOrgJobs();
  const apps = useOrgApplications();
  const canManage = useCan('recruitment.manage');
  const [status, setStatus] = useState<'all' | Job['status']>('all');
  const setVacancy = useAction((id: string, s: Job['status']) => getService().recruitment.setVacancyStatus(id, s), { success: 'Vacancy updated' });
  const rows = jobs.filter((j) => status === 'all' || j.status === status);
  return (
    <>
      <PageHeader
        title="Vacancies"
        description="Create, publish and manage job openings."
        actions={canManage ? <LinkButton href="/org/recruitment/vacancies/new" variant="primary">New vacancy</LinkButton> : null}
      />
      <div className="stack">
        <ChoiceChips<'all' | Job['status']>
          legend="Status"
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          options={(['all', 'published', 'draft', 'closed'] as const).map((s) => ({ value: s, label: s }))}
        />
        <DataTable
          caption="Vacancies"
          rows={rows}
          rowKey={(j) => j.id}
          empty="No vacancies"
          columns={[
            { key: 't', header: 'Title', render: (j) => (canManage ? <Link href={`/org/recruitment/vacancies/${j.id}`}>{j.title}</Link> : j.title), sortValue: (j) => j.title },
            { key: 'd', header: 'Department', render: (j) => j.department || '—' },
            { key: 'm', header: 'Type', render: (j) => `${j.workMode} · ${j.employmentType}` },
            { key: 's', header: 'Salary', render: (j) => salaryRange(j) },
            { key: 'a', header: 'Applicants', numeric: true, render: (j) => <Link href={`/org/recruitment/pipeline?job=${j.id}`}>{apps.filter((a) => a.jobId === j.id).length}</Link>, sortValue: (j) => apps.filter((a) => a.jobId === j.id).length },
            { key: 'p', header: 'Posted', render: (j) => formatDate(j.postedOn), sortValue: (j) => j.postedOn },
            { key: 'st', header: 'Status', render: (j) => <Badge tone={j.status === 'published' ? 'success' : j.status === 'draft' ? 'warning' : 'default'}>{j.status}</Badge> },
            {
              key: 'x',
              header: '',
              render: (j) =>
                canManage ? (
                  j.status === 'published' ? (
                    <Button size="sm" onClick={() => setVacancy.run(j.id, 'closed')}>
                      Close
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => setVacancy.run(j.id, 'published')}>
                      Publish
                    </Button>
                  )
                ) : null,
            },
          ]}
        />
      </div>
    </>
  );
}

export default function RecruitmentPage() {
  return (
    <OrgGate permission="recruitment.view" module="recruitment">
      <Vacancies />
    </OrgGate>
  );
}
