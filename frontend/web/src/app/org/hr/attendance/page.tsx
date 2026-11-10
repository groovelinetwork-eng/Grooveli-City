'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDate, toCsv } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useDeptName, useOrgEmployees, downloadCsv } from '@/lib/store/org-hooks';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, MockNotice, PageHeader, Stat } from '@/components/ui/primitives';
import { SelectField } from '@/components/ui/form';
import { BarChart, DataTable } from '@/components/ui/widgets';

function Attendance() {
  const employees = useOrgEmployees();
  const all = useDemoStore((s) => s.attendance);
  const deptName = useDeptName();
  const ids = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const entries = useMemo(() => all.filter((a) => ids.has(a.employeeId)), [all, ids]);
  const dates = useMemo(() => [...new Set(entries.map((e) => e.date))].sort().reverse(), [entries]);
  const [date, setDate] = useState(dates[0] ?? '');
  const day = entries.filter((e) => e.date === date);
  const count = (s: string) => day.filter((d) => d.status === s).length;
  const perEmployee = employees
    .map((e) => {
      const rows = entries.filter((a) => a.employeeId === e.id);
      const present = rows.filter((r) => r.status === 'present' || r.status === 'remote').length;
      return { id: e.id, name: e.name, dept: deptName(e.departmentId), days: rows.length, rate: rows.length ? Math.round((present / rows.length) * 100) : 0, late: rows.filter((r) => r.status === 'late').length, absent: rows.filter((r) => r.status === 'absent').length };
    })
    .sort((a, b) => a.rate - b.rate);
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Daily attendance and attendance rates (last three weeks)."
        actions={<Button onClick={() => downloadCsv('attendance.csv', toCsv(perEmployee.map(({ id: _id, ...r }) => r)))}>Export CSV</Button>}
      />
      <div className="stack">
        <MockNotice title="Synthetic attendance">Generated data plus clock-ins from the employee persona. No time-tracking device is connected.</MockNotice>
        <SelectField label="Day" value={date} onChange={(e) => setDate(e.target.value)} options={dates.map((d) => ({ value: d, label: formatDate(d) }))} />
        <div className="grid" style={{ ['--min' as string]: '140px' }}>
          <Stat label="Present" value={count('present')} />
          <Stat label="Remote" value={count('remote')} />
          <Stat label="Late" value={count('late')} />
          <Stat label="Absent" value={count('absent')} />
          <Stat label="On leave" value={count('leave')} />
        </div>
        <Card title="Day breakdown">
          <BarChart title={`Attendance on ${date}`} data={['present', 'remote', 'late', 'absent', 'leave'].map((s) => ({ label: s, value: count(s) }))} />
        </Card>
        <DataTable
          caption="Attendance rate by employee"
          rows={perEmployee}
          rowKey={(r) => r.id}
          columns={[
            { key: 'n', header: 'Employee', render: (r) => <Link href={`/org/people/${r.id}`}>{r.name}</Link>, sortValue: (r) => r.name },
            { key: 'd', header: 'Department', render: (r) => r.dept },
            { key: 'r', header: 'Rate', numeric: true, render: (r) => <Badge tone={r.rate < 80 ? 'warning' : 'success'}>{r.rate}%</Badge>, sortValue: (r) => r.rate },
            { key: 'l', header: 'Late', numeric: true, render: (r) => r.late, sortValue: (r) => r.late },
            { key: 'a', header: 'Absent', numeric: true, render: (r) => r.absent, sortValue: (r) => r.absent },
          ]}
        />
      </div>
    </>
  );
}

export default function AttendancePage() {
  return (
    <OrgGate permission="hr.records.manage" module="hr">
      <Attendance />
    </OrgGate>
  );
}
