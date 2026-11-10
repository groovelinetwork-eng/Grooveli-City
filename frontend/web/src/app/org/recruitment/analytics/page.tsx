'use client';

import { useMemo } from 'react';
import { daysBetween, toCsv } from '@grooveli/frontend-domain';
import { useOrgApplications, useOrgInterviews, useOrgJobs, downloadCsv } from '@/lib/store/org-hooks';
import { PIPELINE_STAGES } from '@/lib/labels';
import { OrgGate } from '@/components/shell/org-guard';
import { Button, Card, MockNotice, PageHeader, Stat } from '@/components/ui/primitives';
import { BarChart, DataTable } from '@/components/ui/widgets';

function Analytics() {
  const jobs = useOrgJobs();
  const apps = useOrgApplications();
  const interviews = useOrgInterviews();
  const stats = useMemo(() => {
    const reached = (stage: string) => apps.filter((a) => a.history.some((h) => h.status === stage) || a.status === stage).length;
    const funnel = PIPELINE_STAGES.map((s) => ({ label: s, value: s === 'submitted' ? apps.length : reached(s) }));
    const hires = apps.filter((a) => a.status === 'hired');
    const timeToHire = hires.length
      ? Math.round(hires.reduce((acc, a) => acc + Math.max(1, daysBetween(a.submittedAt, a.history[a.history.length - 1]!.at)), 0) / hires.length)
      : null;
    const perJob = jobs.map((j) => {
      const ja = apps.filter((a) => a.jobId === j.id);
      return {
        job: j.title,
        applicants: ja.length,
        avgFit: ja.length ? Math.round(ja.reduce((s, a) => s + a.fitScore, 0) / ja.length) : 0,
        interviews: interviews.filter((i) => i.jobId === j.id).length,
        hires: ja.filter((a) => a.status === 'hired').length,
        status: j.status,
      };
    });
    const sourced = apps.filter((a) => a.history[0]?.note === 'Sourced').length;
    return { funnel, hires: hires.length, timeToHire, perJob, sourced };
  }, [apps, jobs, interviews]);
  const conversion = apps.length ? Math.round((stats.hires / apps.length) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Recruitment analytics"
        description="Hiring funnel, conversion and per-vacancy performance."
        actions={<Button onClick={() => downloadCsv('recruitment-report.csv', toCsv(stats.perJob))}>Export CSV</Button>}
      />
      <div className="stack">
        <MockNotice title="Synthetic metrics">Computed from demo applications in this browser.</MockNotice>
        <div className="grid" style={{ ['--min' as string]: '150px' }}>
          <Stat label="Applications" value={apps.length} />
          <Stat label="Interviews" value={interviews.length} />
          <Stat label="Hires" value={stats.hires} />
          <Stat label="Application → hire" value={`${conversion}%`} />
          <Stat label="Avg time to hire" value={stats.timeToHire ? `${stats.timeToHire}d` : '—'} />
          <Stat label="Sourced candidates" value={stats.sourced} />
        </div>
        <div className="grid-2">
          <Card title="Hiring funnel">
            <BarChart title="Hiring funnel" data={stats.funnel} />
          </Card>
          <Card title="Applicants per vacancy">
            <BarChart horizontal title="Applicants per vacancy" data={stats.perJob.map((p) => ({ label: p.job, value: p.applicants }))} />
          </Card>
        </div>
        <DataTable
          caption="Per-vacancy performance"
          rows={stats.perJob}
          rowKey={(r) => r.job}
          columns={[
            { key: 'j', header: 'Vacancy', render: (r) => r.job, sortValue: (r) => r.job },
            { key: 'a', header: 'Applicants', numeric: true, render: (r) => r.applicants, sortValue: (r) => r.applicants },
            { key: 'f', header: 'Avg fit', numeric: true, render: (r) => `${r.avgFit}%`, sortValue: (r) => r.avgFit },
            { key: 'i', header: 'Interviews', numeric: true, render: (r) => r.interviews },
            { key: 'h', header: 'Hires', numeric: true, render: (r) => r.hires },
            { key: 's', header: 'Status', render: (r) => r.status },
          ]}
        />
      </div>
    </>
  );
}

export default function RecruitmentAnalyticsPage() {
  return (
    <OrgGate permission="recruitment.view" module="recruitment">
      <Analytics />
    </OrgGate>
  );
}
