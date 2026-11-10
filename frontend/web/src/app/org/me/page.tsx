'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEMO_TODAY, LEAVE_ALLOWANCE, formatDate, formatNaira, type LeaveType } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg, useModuleEnabled } from '@/lib/store/selectors';
import { useDeptName, useEmployeeName, useOrgId, useSelfEmployee } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, InfoNotice, MockNotice, PageHeader } from '@/components/ui/primitives';
import { SelectField, TextField } from '@/components/ui/form';
import { AvatarFigure } from '@/components/ui/avatar';
import { EnterCityButton } from '@/components/enter-city-button';

function LeaveRequestForm({ employeeId }: { employeeId: string }) {
  const [type, setType] = useState<LeaveType>('annual');
  const [start, setStart] = useState(DEMO_TODAY);
  const [end, setEnd] = useState(DEMO_TODAY);
  const [reason, setReason] = useState('');
  const req = useAction(() => getService().hr.requestLeave({ employeeId, type, start, end, days: 0, reason }), { success: 'Leave requested — awaiting approval' });
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await req.run()) setReason('');
      }}
    >
      <div className="grid" style={{ ['--min' as string]: '140px' }}>
        <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as LeaveType)} options={Object.keys(LEAVE_ALLOWANCE).map((t) => ({ value: t, label: t }))} />
        <TextField label="From" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <TextField label="To" type="date" value={end} onChange={(e) => setEnd(e.target.value)} min={start} />
      </div>
      <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      <div>
        <Button type="submit" variant="primary" pending={req.pending}>
          Request leave
        </Button>
      </div>
    </form>
  );
}

function SelfService() {
  const me = useSelfEmployee();
  const orgId = useOrgId();
  const { organization } = useActiveOrg();
  const deptName = useDeptName();
  const empName = useEmployeeName();
  const myLeave = useDemoStore(useShallow((s) => s.leave.filter((l) => l.employeeId === me?.id)));
  const attendance = useDemoStore(useShallow((s) => s.attendance.filter((a) => a.employeeId === me?.id)));
  const runs = useDemoStore((s) => s.payrollRuns);
  const policies = useDemoStore((s) => s.workspaces.find((w) => w.organizationId === orgId)?.policies);
  const acks = useDemoStore((s) => s.policyAcks);
  const announcements = useDemoStore(useShallow((s) => s.announcements.filter((a) => a.organizationId === orgId).slice(0, 4)));
  const recognition = useDemoStore(useShallow((s) => s.recognition.filter((r) => r.toEmployeeId === me?.id)));
  const review = useDemoStore((s) => s.reviews.find((r) => r.employeeId === me?.id));
  const payrollOn = useModuleEnabled('payroll');
  const engageOn = useModuleEnabled('engagement');
  const clock = useAction((status: 'present' | 'remote') => getService().hr.clockIn(me!.id, status), { success: 'Attendance recorded (demo)' });
  const ack = useAction((id: string) => getService().hr.acknowledgePolicy(id), { success: 'Policy acknowledged' });
  const used = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of myLeave) if (l.status === 'approved') m[l.type] = (m[l.type] ?? 0) + l.days;
    return m;
  }, [myLeave]);
  const myPayslips = runs
    .filter((r) => r.organizationId === orgId && r.status === 'approved-preview')
    .flatMap((r) => r.payslips.filter((p) => p.employeeId === me?.id).map((p) => ({ run: r, slip: p })));

  if (!me) {
    return <InfoNotice>This persona has no employee record in {organization?.name}. Switch to Kestrel Systems or the Employee persona.</InfoNotice>;
  }
  const todayEntry = attendance.find((a) => a.date === new Date().toISOString().slice(0, 10));

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <PageHeader
        title="My workplace"
        description={`${organization?.name} · employee self-service`}
        actions={<EnterCityButton district={organization?.district} organizationId={orgId ?? undefined} label="Go to my office (HQ)" />}
      />
      <div className="grid-2">
        <Card>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <div className="avatar-stage" style={{ padding: 6 }}>
              <AvatarFigure avatar={me.avatar} size={64} />
            </div>
            <div>
              <h2>{me.name}</h2>
              <p className="small muted">
                {me.title} · {deptName(me.departmentId)} · reports to {empName(me.managerId)}
              </p>
              <p className="small muted">Started {formatDate(me.startDate)} · {me.employmentType}</p>
            </div>
          </div>
        </Card>
        <Card title="Attendance today">
          {todayEntry ? (
            <p>
              Recorded as <Badge tone="success">{todayEntry.status}</Badge>
            </p>
          ) : (
            <div className="row">
              <Button variant="primary" onClick={() => clock.run('present')} pending={clock.pending}>
                Clock in (office)
              </Button>
              <Button onClick={() => clock.run('remote')} pending={clock.pending}>
                Clock in (remote)
              </Button>
            </div>
          )}
          <p className="small muted" style={{ marginTop: 6 }}>
            Last 10 days: {attendance.slice(-10).filter((a) => a.status === 'present' || a.status === 'remote').length} present/remote.
          </p>
        </Card>
      </div>
      <div className="grid-2">
        <Card title="Leave">
          <ul className="row small" style={{ listStyle: 'none', padding: 0 }}>
            {(['annual', 'sick', 'study'] as LeaveType[]).map((t) => (
              <li key={t}>
                <Badge>
                  {t}: {LEAVE_ALLOWANCE[t] - (used[t] ?? 0)}/{LEAVE_ALLOWANCE[t]} days left
                </Badge>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12 }}>
            <LeaveRequestForm employeeId={me.id} />
          </div>
          <ul className="small" style={{ paddingLeft: 20, marginTop: 12 }}>
            {myLeave.map((l) => (
              <li key={l.id}>
                {l.type} · {formatDate(l.start)}–{formatDate(l.end)} ({l.days}d) · <Badge tone={l.status === 'approved' ? 'success' : l.status === 'pending' ? 'warning' : 'default'}>{l.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <div className="stack">
          {payrollOn ? (
            <Card title="My payslips" actions={<Badge tone="mock">Preview only</Badge>}>
              {myPayslips.length === 0 ? (
                <p className="small muted">No approved payroll previews yet.</p>
              ) : (
                <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
                  {myPayslips.map(({ run, slip }) => (
                    <li key={run.id} className="row-between">
                      <Link href={`/org/payroll/payslips/${run.id}/${slip.employeeId}`}>{run.period}</Link>
                      <span className="mono">{formatNaira(slip.net)} net</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="small muted" style={{ marginTop: 6 }}>
                Illustrative figures only — not an official payslip.
              </p>
            </Card>
          ) : null}
          <Card title="Performance">
            {review ? (
              <p className="small">
                {review.cycle}: <Badge>{review.status}</Badge> · reviewer {review.reviewer}
                {review.goals.map((g) => (
                  <span key={g.title} className="small muted" style={{ display: 'block' }}>
                    {g.title}: {g.progress}%
                  </span>
                ))}
              </p>
            ) : (
              <p className="small muted">No active review.</p>
            )}
          </Card>
        </div>
      </div>
      <div className="grid-2">
        <Card title="Policies to acknowledge">
          {policies?.length ? (
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {policies.map((p) => (
                <li key={p.id} className="row-between">
                  <span>{p.title}</span>
                  {acks.includes(p.id) ? (
                    <Badge tone="success">Acknowledged</Badge>
                  ) : (
                    <Button size="sm" onClick={() => ack.run(p.id)}>
                      Acknowledge
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No policies published" />
          )}
        </Card>
        <Card title="News & recognition">
          {engageOn ? (
            <>
              <ul className="small" style={{ paddingLeft: 20 }}>
                {announcements.map((a) => (
                  <li key={a.id}>
                    <strong>{a.title}</strong> — {a.body}
                  </li>
                ))}
              </ul>
              <p className="small" style={{ marginTop: 8 }}>
                🙌 {recognition.length} recognitions received · <Link href="/org/engagement/surveys">Open surveys</Link> ·{' '}
                <Link href="/org/engagement/activities">Team activities</Link>
              </p>
            </>
          ) : (
            <p className="small muted">Engagement is not enabled on this plan.</p>
          )}
        </Card>
      </div>
      <MockNotice title="Demo self-service">Clock-ins, leave requests and acknowledgements are stored locally; nothing reaches an HR system.</MockNotice>
    </div>
  );
}

export default function MyWorkplacePage() {
  return (
    <OrgGate permission="self.service">
      <SelfService />
    </OrgGate>
  );
}
