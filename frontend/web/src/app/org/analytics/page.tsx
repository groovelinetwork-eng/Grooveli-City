'use client';

import { useMemo } from 'react';
import { WORKFORCE_HISTORY, formatNaira, toCsv } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useDepartments, useLocations, useOrgApplications, useOrgEmployees, useOrgId, downloadCsv } from '@/lib/store/org-hooks';
import { PIPELINE_STAGES } from '@/lib/labels';
import { OrgGate } from '@/components/shell/org-guard';
import { Button, Card, MockNotice, PageHeader, Stat } from '@/components/ui/primitives';
import { BarChart, LineChart } from '@/components/ui/widgets';

function Intelligence() {
  const orgId = useOrgId()!;
  const employees = useOrgEmployees();
  const allEmployees = useOrgEmployees(true);
  const deps = useDepartments();
  const locs = useLocations();
  const apps = useOrgApplications();
  const reviews = useDemoStore((s) => s.reviews);
  const comp = useDemoStore((s) => s.compensation);
  const history = useMemo(() => WORKFORCE_HISTORY[orgId] ?? [], [orgId]);
  const m = useMemo(() => {
    const ids = new Set(employees.map((e) => e.id));
    const exits = history.reduce((a, h) => a + h.exits, 0) + allEmployees.filter((e) => e.status === 'exited').length;
    const avgHead = history.length ? history.reduce((a, h) => a + h.headcount, 0) / history.length : employees.length;
    const rated = reviews.filter((r) => ids.has(r.employeeId) && r.rating !== null);
    return {
      turnover: avgHead ? ((exits / avgHead) * 100).toFixed(1) : '0',
      payroll: comp.filter((c) => ids.has(c.employeeId)).reduce((a, c) => a + c.baseMonthly, 0),
      byDept: deps.map((d) => ({ label: d.name, value: employees.filter((e) => e.departmentId === d.id).length })),
      byLoc: locs.map((l) => ({ label: l.name, value: employees.filter((e) => e.locationId === l.id).length })),
      byType: ['full-time', 'contract', 'part-time', 'internship'].map((t) => ({ label: t, value: employees.filter((e) => e.employmentType === t).length })),
      ratings: [1, 2, 3, 4, 5].map((n) => ({ label: `${n}★`, value: rated.filter((r) => r.rating === n).length })),
      funnel: PIPELINE_STAGES.map((s) => ({ label: s, value: s === 'submitted' ? apps.length : apps.filter((a) => a.status === s || a.history.some((h) => h.status === s)).length })),
    };
  }, [employees, allEmployees, deps, locs, apps, reviews, comp, history]);

  const exportReport = () =>
    downloadCsv(
      'workforce-report.csv',
      toCsv(history.map((h) => ({ month: h.month, headcount: h.headcount, hires: h.hires, exits: h.exits, enps: h.enps, payroll_spend_ngn: h.payrollSpend }))),
    );

  return (
    <>
      <PageHeader title="Workforce intelligence" description="Headcount, turnover, hiring, payroll spend, performance and engagement." actions={<Button onClick={exportReport}>Export report (CSV)</Button>} />
      <div className="stack">
        <MockNotice title="Synthetic analytics">Historical series are fixtures; current figures are computed from demo data in this browser.</MockNotice>
        <div className="grid" style={{ ['--min' as string]: '150px' }}>
          <Stat label="Headcount" value={employees.length} />
          <Stat label="6-month turnover" value={`${m.turnover}%`} />
          <Stat label="Open pipeline" value={apps.filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.status)).length} />
          <Stat label="Monthly base payroll" value={formatNaira(m.payroll, { compact: true })} />
          <Stat label="eNPS" value={history.at(-1)?.enps ?? '—'} />
        </div>
        <div className="grid-2">
          <Card title="Headcount trend">
            <LineChart title="Headcount by month" data={history.map((h) => ({ label: h.month.slice(5), value: h.headcount }))} />
          </Card>
          <Card title="Hires vs exits">
            <BarChart title="Hires minus exits by month" data={history.map((h) => ({ label: h.month.slice(5), value: h.hires - h.exits }))} />
          </Card>
          <Card title="Payroll expenditure">
            <LineChart title="Payroll spend by month" data={history.map((h) => ({ label: h.month.slice(5), value: h.payrollSpend }))} format={(n) => formatNaira(n, { compact: true })} />
          </Card>
          <Card title="Engagement (eNPS)">
            <LineChart title="eNPS by month" data={history.map((h) => ({ label: h.month.slice(5), value: h.enps }))} />
          </Card>
          <Card title="Recruitment funnel">
            <BarChart title="Recruitment funnel" data={m.funnel} />
          </Card>
          <Card title="Performance ratings">
            <BarChart title="Performance rating distribution" data={m.ratings} />
          </Card>
          <Card title="Distribution by department">
            <BarChart horizontal title="Headcount by department" data={m.byDept} />
          </Card>
          <Card title="Distribution by location & type">
            <BarChart horizontal title="Headcount by location" data={m.byLoc} />
            <div style={{ marginTop: 12 }}>
              <BarChart horizontal title="Headcount by employment type" data={m.byType} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <OrgGate permission="analytics.view" module="analytics">
      <Intelligence />
    </OrgGate>
  );
}
