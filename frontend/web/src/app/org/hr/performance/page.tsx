'use client';

import { useMemo, useState } from 'react';
import type { PerformanceReview } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useOrgEmployees, useDeptName } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, PageHeader, Stat } from '@/components/ui/primitives';
import { SelectField, TextArea } from '@/components/ui/form';
import { BarChart, DataTable, Dialog } from '@/components/ui/widgets';

const STAGES: PerformanceReview['status'][] = ['not-started', 'self-review', 'manager-review', 'calibrated', 'shared'];

function Performance() {
  const employees = useOrgEmployees();
  const all = useDemoStore((s) => s.reviews);
  const deptName = useDeptName();
  const emp = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const reviews = all.filter((r) => emp.has(r.employeeId));
  const [edit, setEdit] = useState<PerformanceReview | null>(null);
  const save = useAction((r: PerformanceReview) => getService().hr.updateReview(r.id, r), { success: 'Review saved' });
  const rated = reviews.filter((r) => r.rating !== null);
  const avg = rated.length ? (rated.reduce((a, r) => a + r.rating!, 0) / rated.length).toFixed(1) : '—';
  return (
    <>
      <PageHeader title="Performance & appraisals" description="2026 H2 review cycle progress, ratings and goals." />
      <div className="stack">
        <div className="grid" style={{ ['--min' as string]: '150px' }}>
          <Stat label="Reviews in cycle" value={reviews.length} />
          <Stat label="Completed (shared)" value={reviews.filter((r) => r.status === 'shared').length} />
          <Stat label="Average rating" value={avg} />
        </div>
        <div className="grid-2">
          <Card title="Cycle progress">
            <BarChart title="Reviews by stage" data={STAGES.map((s) => ({ label: s, value: reviews.filter((r) => r.status === s).length }))} />
          </Card>
          <Card title="Rating distribution">
            <BarChart title="Ratings" data={[1, 2, 3, 4, 5].map((n) => ({ label: `${n}★`, value: rated.filter((r) => r.rating === n).length }))} />
          </Card>
        </div>
        <DataTable
          caption="Performance reviews"
          rows={reviews}
          rowKey={(r) => r.id}
          columns={[
            { key: 'e', header: 'Employee', render: (r) => emp.get(r.employeeId)?.name, sortValue: (r) => emp.get(r.employeeId)?.name ?? '' },
            { key: 'd', header: 'Department', render: (r) => deptName(emp.get(r.employeeId)?.departmentId) },
            { key: 'rv', header: 'Reviewer', render: (r) => r.reviewer },
            { key: 's', header: 'Stage', render: (r) => <Badge tone={r.status === 'shared' ? 'success' : 'default'}>{r.status}</Badge>, sortValue: (r) => STAGES.indexOf(r.status) },
            { key: 'r', header: 'Rating', numeric: true, render: (r) => r.rating ?? '—', sortValue: (r) => r.rating ?? 0 },
            { key: 'g', header: 'Goals', render: (r) => `${Math.round(r.goals.reduce((a, g) => a + g.progress, 0) / Math.max(1, r.goals.length))}% avg` },
            { key: 'x', header: '', render: (r) => <Button size="sm" onClick={() => setEdit(r)}>Edit</Button> },
          ]}
        />
      </div>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`Review: ${edit ? emp.get(edit.employeeId)?.name : ''}`}
        actions={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              pending={save.pending}
              onClick={async () => {
                if (edit) await save.run(edit);
                setEdit(null);
              }}
            >
              Save review
            </Button>
          </>
        }
      >
        {edit ? (
          <>
            <div className="grid-2">
              <SelectField label="Stage" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as PerformanceReview['status'] })} options={STAGES.map((s) => ({ value: s, label: s }))} />
              <SelectField
                label="Rating"
                value={edit.rating === null ? '' : String(edit.rating)}
                onChange={(e) => setEdit({ ...edit, rating: e.target.value ? Number(e.target.value) : null })}
                options={[{ value: '', label: 'Not rated' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}` }))]}
              />
            </div>
            {edit.goals.map((g, i) => (
              <label key={g.title} className="field">
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  {g.title}: {g.progress}%
                </span>
                <input type="range" min={0} max={100} value={g.progress} onChange={(e) => setEdit({ ...edit, goals: edit.goals.map((x, j) => (j === i ? { ...x, progress: Number(e.target.value) } : x)) })} />
              </label>
            ))}
            <TextArea label="Strengths" value={edit.strengths} onChange={(e) => setEdit({ ...edit, strengths: e.target.value })} />
            <TextArea label="Areas to develop" value={edit.improvements} onChange={(e) => setEdit({ ...edit, improvements: e.target.value })} />
          </>
        ) : null}
      </Dialog>
    </>
  );
}

export default function PerformancePage() {
  return (
    <OrgGate permission="hr.performance.manage" module="hr">
      <Performance />
    </OrgGate>
  );
}
