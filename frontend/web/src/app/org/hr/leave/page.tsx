'use client';

import { useMemo, useState } from 'react';
import { LEAVE_ALLOWANCE, formatDate, type LeaveRequest } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { usePersona } from '@/lib/store/selectors';
import { useDeptName, useOrgEmployees } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, PageHeader } from '@/components/ui/primitives';
import { ChoiceChips } from '@/components/ui/form';
import { DataTable } from '@/components/ui/widgets';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

function Leave() {
  const employees = useOrgEmployees();
  const all = useDemoStore((s) => s.leave);
  const persona = usePersona();
  const deptName = useDeptName();
  const [filter, setFilter] = useState<Filter>('pending');
  const decide = useAction((id: string, d: 'approved' | 'rejected') => getService().hr.decideLeave(id, d, persona?.displayName ?? 'Approver'), {
    success: 'Decision recorded (no notification sent)',
  });
  const emp = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const rows = all.filter((l) => emp.has(l.employeeId) && (filter === 'all' || l.status === filter)).sort((a, b) => a.start.localeCompare(b.start));
  const overlap = (l: LeaveRequest) => {
    const e = emp.get(l.employeeId)!;
    return all.filter(
      (o) => o.id !== l.id && o.status === 'approved' && emp.get(o.employeeId)?.departmentId === e.departmentId && o.start <= l.end && o.end >= l.start,
    ).length;
  };
  const used = (l: LeaveRequest) => all.filter((o) => o.employeeId === l.employeeId && o.type === l.type && o.status === 'approved').reduce((a, o) => a + o.days, 0);
  return (
    <>
      <PageHeader title="Leave" description="Review requests with balance and team-coverage context." />
      <div className="stack">
        <ChoiceChips<Filter> legend="Show" value={filter} onChange={(v) => setFilter(v as Filter)} options={(['pending', 'approved', 'rejected', 'all'] as Filter[]).map((v) => ({ value: v, label: v }))} />
        <DataTable
          caption="Leave requests"
          rows={rows}
          rowKey={(l) => l.id}
          empty="No requests"
          columns={[
            { key: 'e', header: 'Employee', render: (l) => <span>{emp.get(l.employeeId)?.name}<br /><span className="small muted">{deptName(emp.get(l.employeeId)?.departmentId)}</span></span> },
            { key: 't', header: 'Type', render: (l) => l.type },
            { key: 'd', header: 'Dates', render: (l) => `${formatDate(l.start)} – ${formatDate(l.end)}`, sortValue: (l) => l.start },
            { key: 'n', header: 'Days', numeric: true, render: (l) => l.days },
            { key: 'b', header: 'Balance after', numeric: true, render: (l) => `${LEAVE_ALLOWANCE[l.type] - used(l) - (l.status === 'pending' ? l.days : 0)}/${LEAVE_ALLOWANCE[l.type]}` },
            { key: 'o', header: 'Team overlap', render: (l) => (overlap(l) ? <Badge tone="warning">{overlap(l)} others off</Badge> : <span className="small muted">none</span>) },
            {
              key: 's',
              header: 'Decision',
              render: (l) =>
                l.status === 'pending' ? (
                  <span className="row">
                    <Button size="sm" variant="primary" onClick={() => decide.run(l.id, 'approved')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => decide.run(l.id, 'rejected')}>
                      Reject
                    </Button>
                  </span>
                ) : (
                  <Badge tone={l.status === 'approved' ? 'success' : 'default'}>
                    {l.status}
                    {l.decidedBy ? ` · ${l.decidedBy}` : ''}
                  </Badge>
                ),
            },
          ]}
        />
      </div>
    </>
  );
}

export default function LeavePage() {
  return (
    <OrgGate permission="hr.leave.approve" module="hr">
      <Leave />
    </OrgGate>
  );
}
