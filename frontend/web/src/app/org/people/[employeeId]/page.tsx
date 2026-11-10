'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEMO_TODAY, addDays, formatDate, formatNaira, type EmployeeRecord } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan, useModuleEnabled } from '@/lib/store/selectors';
import { useDepartments, useDeptName, useEmployeeName, useLocations, useOrgId } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { EMPLOYEE_STATUS_TONE } from '@/lib/labels';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, LinkButton, MockNotice } from '@/components/ui/primitives';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
import { DataTable, Dialog, Tabs } from '@/components/ui/widgets';
import { AvatarFigure } from '@/components/ui/avatar';

function ProfileTab({ e }: { e: EmployeeRecord }) {
  const deps = useDepartments();
  const locs = useLocations();
  const [d, setD] = useState(e);
  const save = useAction((patch: Partial<EmployeeRecord>) => getService().hr.updateEmployee(e.id, patch), { success: 'Record saved' });
  return (
    <Card actions={<Button variant="primary" size="sm" pending={save.pending} disabled={JSON.stringify(d) === JSON.stringify(e)} onClick={() => save.run(d)}>Save</Button>}>
      <div className="grid-2">
        <TextField label="Name" value={d.name} onChange={(x) => setD({ ...d, name: x.target.value })} />
        <TextField label="Title" value={d.title} onChange={(x) => setD({ ...d, title: x.target.value })} />
        <SelectField label="Department" value={d.departmentId} onChange={(x) => setD({ ...d, departmentId: x.target.value })} options={deps.map((x) => ({ value: x.id, label: x.name }))} />
        <SelectField label="Location" value={d.locationId} onChange={(x) => setD({ ...d, locationId: x.target.value })} options={locs.map((x) => ({ value: x.id, label: x.name }))} />
        <TextField label="Work email" value={d.email} onChange={(x) => setD({ ...d, email: x.target.value })} />
        <TextField label="Emergency contact" value={d.emergencyContact} onChange={(x) => setD({ ...d, emergencyContact: x.target.value })} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Checkbox label="Show name and title in the public HQ directory (employee opt-in)" checked={d.publicDirectory} onChange={(x) => setD({ ...d, publicDirectory: x.target.checked })} />
      </div>
    </Card>
  );
}

function DocumentsTab({ e }: { e: EmployeeRecord }) {
  const add = useAction((f: File) => getService().hr.addDocument(e.id, { name: f.name, kind: 'other', sizeKb: Math.round(f.size / 1024) }), { success: 'Document recorded (metadata only)' });
  return (
    <Card>
      <MockNotice title="Metadata only">Files are not uploaded or stored — only name and size are recorded.</MockNotice>
      <DataTable
        caption="Documents"
        rows={e.documents}
        rowKey={(d) => d.id}
        empty="No documents"
        columns={[
          { key: 'n', header: 'Document', render: (d) => `📄 ${d.name}` },
          { key: 'k', header: 'Type', render: (d) => d.kind },
          { key: 'a', header: 'Added', render: (d) => formatDate(d.addedOn) },
          { key: 's', header: 'Size', numeric: true, render: (d) => `${d.sizeKb} KB` },
        ]}
      />
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="doc-up">Add document</label>
        <input id="doc-up" type="file" onChange={(x) => x.target.files?.[0] && add.run(x.target.files[0])} />
      </div>
    </Card>
  );
}

function LifecycleTab({ e }: { e: EmployeeRecord }) {
  const [lastDay, setLastDay] = useState(addDays(DEMO_TODAY, 30));
  const [confirm, setConfirm] = useState(false);
  const toggle = useAction((t: string) => getService().hr.toggleLifecycleTask(e.id, t));
  const start = useAction(() => getService().hr.startOffboarding(e.id, lastDay), { success: 'Offboarding started' });
  const complete = useAction(() => getService().hr.completeOffboarding(e.id), { success: 'Employee marked as exited' });
  const tasks = e.lifecycleTasks;
  return (
    <Card>
      {tasks.length === 0 ? <p className="small muted">No active onboarding or offboarding.</p> : null}
      {(['onboarding', 'offboarding'] as const).map((phase) =>
        tasks.some((t) => t.phase === phase) ? (
          <div key={phase} className="stack" style={{ marginBottom: 12 }}>
            <h3 style={{ textTransform: 'capitalize' }}>{phase} checklist</h3>
            {tasks
              .filter((t) => t.phase === phase)
              .map((t) => (
                <Checkbox key={t.id} label={`${t.label} · owner: ${t.owner}`} checked={t.done} onChange={() => toggle.run(t.id)} />
              ))}
          </div>
        ) : null,
      )}
      {e.status === 'active' || e.status === 'on-leave' ? (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <TextField label="Last working day" type="date" value={lastDay} onChange={(x) => setLastDay(x.target.value)} />
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Start offboarding
          </Button>
        </div>
      ) : null}
      {e.status === 'offboarding' ? (
        <Button variant="danger" pending={complete.pending} onClick={() => complete.run()}>
          Complete offboarding
        </Button>
      ) : null}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Start offboarding ${e.name}?`}
        actions={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              pending={start.pending}
              onClick={async () => {
                await start.run();
                setConfirm(false);
              }}
            >
              Start offboarding
            </Button>
          </>
        }
      >
        <p>Creates handover, equipment, exit interview and final pay preview tasks. Last day: {formatDate(lastDay)}.</p>
      </Dialog>
    </Card>
  );
}

function EmployeeRecordView({ id }: { id: string }) {
  const orgId = useOrgId();
  const e = useDemoStore((s) => s.employees.find((x) => x.id === id));
  const attendance = useDemoStore(useShallow((s) => s.attendance.filter((a) => a.employeeId === id)));
  const leave = useDemoStore(useShallow((s) => s.leave.filter((l) => l.employeeId === id)));
  const review = useDemoStore((s) => s.reviews.find((r) => r.employeeId === id));
  const comp = useDemoStore((s) => s.compensation.find((c) => c.employeeId === id));
  const canPay = useCan('payroll.view');
  const payrollOn = useModuleEnabled('payroll');
  const deptName = useDeptName();
  const empName = useEmployeeName();
  if (!e || e.organizationId !== orgId) return <EmptyState title="Employee not found in this organisation" action={<LinkButton href="/org/people">Directory</LinkButton>} />;
  const present = attendance.filter((a) => a.status === 'present' || a.status === 'remote').length;

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <nav aria-label="Breadcrumb" className="small">
        <Link href="/org/people">Directory</Link> / {e.name}
      </nav>
      <header className="row" style={{ flexWrap: 'nowrap' }}>
        <div className="avatar-stage" style={{ padding: 6 }}>
          <AvatarFigure avatar={e.avatar} size={72} />
        </div>
        <div>
          <h1>{e.name}</h1>
          <p className="muted">
            {e.title} · {deptName(e.departmentId)} · manager {empName(e.managerId)} · since {formatDate(e.startDate)}
          </p>
          <Badge tone={EMPLOYEE_STATUS_TONE[e.status]}>{e.status}</Badge>
        </div>
      </header>
      <MockNotice title="Synthetic HR record">Not a secure record system. In production, access to employee data must be authorised by the backend.</MockNotice>
      <Tabs
        label="Employee record"
        tabs={[
          { id: 'profile', label: 'Profile', content: <ProfileTab key={e.id + e.name} e={e} /> },
          { id: 'lifecycle', label: 'Onboarding / offboarding', content: <LifecycleTab e={e} /> },
          { id: 'documents', label: `Documents (${e.documents.length})`, content: <DocumentsTab e={e} /> },
          {
            id: 'attendance',
            label: 'Attendance',
            content: (
              <Card>
                <p className="small">
                  {present}/{attendance.length} recorded days present or remote (last 3 weeks).
                </p>
                <DataTable
                  caption="Attendance"
                  rows={[...attendance].sort((a, b) => b.date.localeCompare(a.date))}
                  rowKey={(a) => a.date}
                  pageSize={10}
                  columns={[
                    { key: 'd', header: 'Date', render: (a) => formatDate(a.date) },
                    { key: 's', header: 'Status', render: (a) => <Badge tone={a.status === 'absent' ? 'danger' : a.status === 'late' ? 'warning' : 'default'}>{a.status}</Badge> },
                    { key: 'h', header: 'Hours', numeric: true, render: (a) => a.hours },
                  ]}
                />
              </Card>
            ),
          },
          {
            id: 'leave',
            label: 'Leave',
            content: (
              <Card>
                <DataTable
                  caption="Leave requests"
                  rows={leave}
                  rowKey={(l) => l.id}
                  empty="No leave requests"
                  columns={[
                    { key: 't', header: 'Type', render: (l) => l.type },
                    { key: 'd', header: 'Dates', render: (l) => `${formatDate(l.start)} – ${formatDate(l.end)}` },
                    { key: 'n', header: 'Days', numeric: true, render: (l) => l.days },
                    { key: 's', header: 'Status', render: (l) => <Badge>{l.status}</Badge> },
                  ]}
                />
                <p className="small" style={{ marginTop: 8 }}>
                  <Link href="/org/hr/leave">Manage approvals →</Link>
                </p>
              </Card>
            ),
          },
          {
            id: 'performance',
            label: 'Performance',
            content: (
              <Card>
                {review ? (
                  <div className="stack">
                    <p>
                      {review.cycle} · <Badge>{review.status}</Badge> · reviewer {review.reviewer} · rating {review.rating ?? '—'}/5
                    </p>
                    {review.goals.map((g) => (
                      <p key={g.title} className="small">
                        {g.title}: {g.progress}%
                      </p>
                    ))}
                    <p className="small muted">{review.strengths}</p>
                    <Link href="/org/hr/performance">Open in performance reviews →</Link>
                  </div>
                ) : (
                  <p className="muted small">No review this cycle.</p>
                )}
              </Card>
            ),
          },
          ...(canPay && payrollOn && comp
            ? [
                {
                  id: 'comp',
                  label: 'Compensation',
                  content: (
                    <Card actions={<Badge tone="mock">Synthetic</Badge>}>
                      <p>
                        Base {formatNaira(comp.baseMonthly)}/month · effective {formatDate(comp.effectiveFrom)} · bank details {comp.bankOnFile ? 'on file' : 'missing'}
                      </p>
                      <ul className="small" style={{ paddingLeft: 20, marginTop: 8 }}>
                        {comp.history.map((h, i) => (
                          <li key={i}>
                            {formatDate(h.date)} — {formatNaira(h.baseMonthly)} ({h.reason})
                          </li>
                        ))}
                      </ul>
                      <Link href="/org/payroll">Salary records →</Link>
                    </Card>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

export default function EmployeePage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = use(params);
  return (
    <OrgGate permission="hr.records.manage" module="hr">
      <EmployeeRecordView id={employeeId} />
    </OrgGate>
  );
}
