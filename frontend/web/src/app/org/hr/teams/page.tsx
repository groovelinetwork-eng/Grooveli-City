'use client';

import Link from 'next/link';
import { useCan } from '@/lib/store/selectors';
import { useDepartments, useEmployeeName, useLocations, useOrgEmployees } from '@/lib/store/org-hooks';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { AvatarFigure } from '@/components/ui/avatar';

function Teams() {
  const deps = useDepartments();
  const locs = useLocations();
  const employees = useOrgEmployees();
  const empName = useEmployeeName();
  const canManage = useCan('hr.records.manage');
  return (
    <>
      <PageHeader title="Teams & departments" description="Who works where, and who leads each team." />
      <div className="grid" style={{ ['--min' as string]: '320px' }}>
        {deps.map((d) => {
          const members = employees.filter((e) => e.departmentId === d.id);
          return (
            <Card key={d.id} title={<h2 style={{ fontSize: '1.05rem' }}>{d.name}</h2>} actions={<Badge>{members.length} people</Badge>}>
              <p className="small muted">
                Led by {empName(d.headEmployeeId)} · {locs.find((l) => l.id === d.locationId)?.name ?? 'No location'}
              </p>
              <p className="small">{d.responsibilities}</p>
              <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 8, ['--gap' as string]: '4px' }}>
                {members.map((m) => (
                  <li key={m.id} className="row" style={{ flexWrap: 'nowrap' }}>
                    <AvatarFigure avatar={m.avatar} size={24} label="" />
                    <span className="small">
                      {canManage ? <Link href={`/org/people/${m.id}`}>{m.name}</Link> : m.name} — {m.title}
                      {m.id === d.headEmployeeId ? ' (lead)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}

export default function TeamsPage() {
  return (
    <OrgGate permission="hr.directory.view" module="hr">
      <Teams />
    </OrgGate>
  );
}
