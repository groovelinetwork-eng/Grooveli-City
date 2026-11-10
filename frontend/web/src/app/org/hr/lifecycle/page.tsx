'use client';

import Link from 'next/link';
import { formatDate } from '@grooveli/frontend-domain';
import { useDeptName, useOrgEmployees } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Card, EmptyState, PageHeader, ProgressBar } from '@/components/ui/primitives';
import { Checkbox } from '@/components/ui/form';

function Lifecycle() {
  const employees = useOrgEmployees();
  const deptName = useDeptName();
  const toggle = useAction((emp: string, task: string) => getService().hr.toggleLifecycleTask(emp, task));
  const section = (phase: 'onboarding' | 'offboarding') => {
    const people = employees.filter((e) => e.status === phase);
    return (
      <section aria-labelledby={`${phase}-h`} className="stack">
        <h2 id={`${phase}-h`} style={{ textTransform: 'capitalize' }}>
          {phase} <Badge>{people.length}</Badge>
        </h2>
        {people.length === 0 ? (
          <EmptyState title={`Nobody is ${phase}`}>{phase === 'onboarding' ? 'Add a new hire from the directory.' : 'Start offboarding from an employee record.'}</EmptyState>
        ) : (
          <div className="grid" style={{ ['--min' as string]: '300px' }}>
            {people.map((e) => {
              const tasks = e.lifecycleTasks.filter((t) => t.phase === phase);
              const done = tasks.filter((t) => t.done).length;
              return (
                <Card key={e.id} title={<h3><Link href={`/org/people/${e.id}`}>{e.name}</Link></h3>} actions={<span className="small muted">{deptName(e.departmentId)}</span>}>
                  <p className="small muted">
                    {e.title} · {phase === 'onboarding' ? `starts ${formatDate(e.startDate)}` : 'leaving'}
                  </p>
                  <ProgressBar value={done} max={tasks.length} label={`${e.name} ${phase} progress`} />
                  <div className="stack" style={{ marginTop: 8, ['--gap' as string]: '4px' }}>
                    {tasks.map((t) => (
                      <Checkbox key={t.id} label={`${t.label} (${t.owner})`} checked={t.done} onChange={() => toggle.run(e.id, t.id)} />
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    );
  };
  return (
    <>
      <PageHeader title="Onboarding & offboarding" description="Track every joiner and leaver's checklist. Completing onboarding marks the employee active." />
      <div className="stack" style={{ ['--gap' as string]: '24px' }}>
        {section('onboarding')}
        {section('offboarding')}
      </div>
    </>
  );
}

export default function LifecyclePage() {
  return (
    <OrgGate permission="hr.records.manage" module="hr">
      <Lifecycle />
    </OrgGate>
  );
}
