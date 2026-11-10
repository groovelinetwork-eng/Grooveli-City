'use client';

import { useMemo } from 'react';
import { WORKFORCE_HISTORY, formatNaira, toCsv } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useDepartments, useOrgEmployees, useOrgId, downloadCsv } from '@/lib/store/org-hooks';
import { OrgGate } from '@/components/shell/org-guard';
import { Button, Card, PageHeader, Stat } from '@/components/ui/primitives';
import { BarChart, DataTable, LineChart } from '@/components/ui/widgets';
import { PayrollDisclaimer } from '@/components/payroll/payroll-notice';

function Reports() {
  const orgId = useOrgId()!;
  const employees = useOrgEmployees();
  const deps = useDepartments();
  const comp = useDemoStore((s) => s.compensation);
  const history = WORKFORCE_HISTORY[orgId] ?? [];
  const byDept = useMemo(
    () =>
      deps.map((d) => {
        const people = employees.filter((e) => e.departmentId === d.id);
        const bases = people.map((p) => comp.find((c) => c.employeeId === p.id)?.baseMonthly ?? 0);
        const total = bases.reduce((a, b) => a + b, 0);
        return { department: d.name, headcount: people.length, monthly_base_ngn: total, average_ngn: people.length ? Math.round(total / people.length) : 0, min_ngn: bases.length ? Math.min(...bases) : 0, max_ngn: bases.length ? Math.max(...bases) : 0 };
      }),
    [deps, employees, comp],
  );
  const total = byDept.reduce((a, d) => a + d.monthly_base_ngn, 0);
  return (
    <>
      <PageHeader title="Compensation reports" description="Payroll spend and compensation distribution." actions={<Button onClick={() => downloadCsv('compensation-by-department.csv', toCsv(byDept))}>Export CSV</Button>} />
      <div className="stack">
        <PayrollDisclaimer />
        <div className="grid" style={{ ['--min' as string]: '160px' }}>
          <Stat label="Monthly base payroll" value={formatNaira(total, { compact: true })} />
          <Stat label="Annualised base" value={formatNaira(total * 12, { compact: true })} />
          <Stat label="Departments" value={deps.length} />
        </div>
        <div className="grid-2">
          <Card title="Base payroll by department">
            <BarChart horizontal title="Monthly base payroll by department" data={byDept.map((d) => ({ label: d.department, value: d.monthly_base_ngn }))} format={(n) => formatNaira(n, { compact: true })} />
          </Card>
          <Card title="Payroll spend trend (synthetic)">
            <LineChart title="Monthly payroll spend" data={history.map((h) => ({ label: h.month.slice(5), value: h.payrollSpend }))} format={(n) => formatNaira(n, { compact: true })} />
          </Card>
        </div>
        <DataTable
          caption="Compensation by department"
          rows={byDept}
          rowKey={(r) => r.department}
          columns={[
            { key: 'd', header: 'Department', render: (r) => r.department },
            { key: 'h', header: 'Headcount', numeric: true, render: (r) => r.headcount },
            { key: 't', header: 'Monthly base', numeric: true, render: (r) => formatNaira(r.monthly_base_ngn), sortValue: (r) => r.monthly_base_ngn },
            { key: 'a', header: 'Average', numeric: true, render: (r) => formatNaira(r.average_ngn), sortValue: (r) => r.average_ngn },
            { key: 'r', header: 'Range', numeric: true, render: (r) => `${formatNaira(r.min_ngn, { compact: true })}–${formatNaira(r.max_ngn, { compact: true })}` },
          ]}
        />
      </div>
    </>
  );
}

export default function PayrollReportsPage() {
  return (
    <OrgGate permission="payroll.view" module="payroll">
      <Reports />
    </OrgGate>
  );
}
