'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEMO_TODAY, addDays, formatDate, type EmployeeRecord, type EmploymentType } from '@grooveli/frontend-domain';
import { useCan } from '@/lib/store/selectors';
import { useDepartments, useDeptName, useLocations, useOrgEmployees, useOrgId } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { EMPLOYEE_STATUS_TONE } from '@/lib/labels';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, PageHeader } from '@/components/ui/primitives';
import { SelectField, TextField } from '@/components/ui/form';
import { DataTable, Dialog } from '@/components/ui/widgets';
import { AvatarFigure } from '@/components/ui/avatar';

function NewHireDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const orgId = useOrgId()!;
  const deps = useDepartments();
  const locs = useLocations();
  const [f, setF] = useState({ name: '', title: '', departmentId: deps[0]?.id ?? '', locationId: locs[0]?.id ?? '', email: '', startDate: addDays(DEMO_TODAY, 14), employmentType: 'full-time' as EmploymentType, baseMonthly: 400_000 });
  const add = useAction(() => getService().hr.addEmployee({ ...f, organizationId: orgId }), { success: 'New hire added — onboarding checklist created' });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add new hire"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            pending={add.pending}
            onClick={async () => {
              const r = await add.run();
              if (r) {
                onClose();
                router.push(`/org/people/${r.employeeId}`);
              }
            }}
          >
            Add & start onboarding
          </Button>
        </>
      }
    >
      <div className="grid-2">
        <TextField label="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <TextField label="Job title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        <TextField label="Work email (synthetic)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField label="Start date" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        <SelectField label="Department" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} options={deps.map((d) => ({ value: d.id, label: d.name }))} />
        <SelectField label="Location" value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })} options={locs.map((l) => ({ value: l.id, label: l.name }))} />
        <SelectField
          label="Employment type"
          value={f.employmentType}
          onChange={(e) => setF({ ...f, employmentType: e.target.value as EmploymentType })}
          options={['full-time', 'part-time', 'contract', 'internship'].map((v) => ({ value: v, label: v }))}
        />
        <TextField label="Base monthly salary (₦)" type="number" min={0} step={5000} value={f.baseMonthly} onChange={(e) => setF({ ...f, baseMonthly: Number(e.target.value) || 0 })} />
      </div>
    </Dialog>
  );
}

function Directory() {
  const employees = useOrgEmployees(true);
  const deps = useDepartments();
  const deptName = useDeptName();
  const canManage = useCan('hr.records.manage');
  const [q, setQ] = useState('');
  const [dep, setDep] = useState('');
  const [status, setStatus] = useState('current');
  const [adding, setAdding] = useState(false);
  const rows = useMemo(
    () =>
      employees.filter(
        (e) =>
          (!q || `${e.name} ${e.title}`.toLowerCase().includes(q.toLowerCase())) &&
          (!dep || e.departmentId === dep) &&
          (status === 'all' || (status === 'current' ? e.status !== 'exited' : e.status === status)),
      ),
    [employees, q, dep, status],
  );
  return (
    <>
      <PageHeader title="Employee directory" description={`${employees.filter((e) => e.status !== 'exited').length} people`} actions={canManage ? <Button variant="primary" onClick={() => setAdding(true)}>Add new hire</Button> : null} />
      <div className="stack">
        <form className="card grid" role="search" aria-label="Filter employees" style={{ ['--min' as string]: '180px' }} onSubmit={(e) => e.preventDefault()}>
          <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or title" />
          <SelectField label="Department" value={dep} onChange={(e) => setDep(e.target.value)} options={[{ value: '', label: 'All' }, ...deps.map((d) => ({ value: d.id, label: d.name }))]} />
          <SelectField
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'current', label: 'Current staff' },
              { value: 'all', label: 'All incl. exited' },
              { value: 'onboarding', label: 'Onboarding' },
              { value: 'offboarding', label: 'Offboarding' },
              { value: 'on-leave', label: 'On leave' },
              { value: 'exited', label: 'Exited' },
            ]}
          />
        </form>
        <DataTable
          caption="Employees"
          rows={rows}
          rowKey={(e) => e.id}
          columns={[
            {
              key: 'n',
              header: 'Name',
              sortValue: (e) => e.name,
              render: (e) => (
                <span className="row" style={{ flexWrap: 'nowrap' }}>
                  <AvatarFigure avatar={e.avatar} size={28} label="" />
                  {canManage ? <Link href={`/org/people/${e.id}`}>{e.name}</Link> : e.name}
                </span>
              ),
            },
            { key: 't', header: 'Title', render: (e) => e.title, sortValue: (e) => e.title },
            { key: 'd', header: 'Department', render: (e) => deptName(e.departmentId), sortValue: (e) => deptName(e.departmentId) },
            { key: 's', header: 'Start', render: (e) => formatDate(e.startDate), sortValue: (e) => e.startDate },
            { key: 'st', header: 'Status', render: (e) => <Badge tone={EMPLOYEE_STATUS_TONE[e.status]}>{e.status}</Badge> },
            ...(canManage ? [{ key: 'm', header: 'Email', render: (e: EmployeeRecord) => <span className="small">{e.email}</span> }] : []),
          ]}
        />
      </div>
      {adding ? <NewHireDialog open={adding} onClose={() => setAdding(false)} /> : null}
    </>
  );
}

export default function PeoplePage() {
  return (
    <OrgGate permission="hr.directory.view" module="hr">
      <Directory />
    </OrgGate>
  );
}
