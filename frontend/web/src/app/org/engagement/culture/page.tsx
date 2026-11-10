'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { WORKFORCE_HISTORY, type CultureInitiative } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useOrgId } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, PageHeader, ProgressBar, Stat } from '@/components/ui/primitives';
import { SelectField, TextField } from '@/components/ui/form';
import { LineChart } from '@/components/ui/widgets';

function Culture() {
  const orgId = useOrgId()!;
  const initiatives = useDemoStore(useShallow((s) => s.initiatives.filter((i) => i.organizationId === orgId)));
  const surveys = useDemoStore(useShallow((s) => s.surveys.filter((x) => x.organizationId === orgId)));
  const history = WORKFORCE_HISTORY[orgId] ?? [];
  const [f, setF] = useState({ title: '', owner: '' });
  const save = useAction((i: CultureInitiative) => getService().engagement.saveInitiative(i), { success: 'Initiative saved' });
  const latest = surveys.find((s) => s.status === 'open') ?? surveys[0];
  const firstScale = latest?.questions.find((q) => q.kind === 'scale');
  const vals = latest && firstScale ? latest.responses.map((r) => r.answers[firstScale.id]).filter((v): v is number => typeof v === 'number') : [];
  const satisfaction = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
  return (
    <>
      <PageHeader title="Culture & satisfaction" description="Track satisfaction over time and culture initiatives." />
      <div className="stack">
        <div className="grid" style={{ ['--min' as string]: '160px' }}>
          <Stat label="Current satisfaction (0–10)" value={satisfaction} hint={latest?.title} />
          <Stat label="eNPS (synthetic trend)" value={history.at(-1)?.enps ?? '—'} />
          <Stat label="Active initiatives" value={initiatives.filter((i) => i.status === 'active').length} />
        </div>
        <Card title="eNPS trend">
          <LineChart title="Employee NPS by month" data={history.map((h) => ({ label: h.month.slice(5), value: h.enps }))} />
        </Card>
        <Card title="Culture initiatives">
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {initiatives.map((i) => (
              <li key={i.id} className="stack" style={{ ['--gap' as string]: '4px' }}>
                <div className="row-between">
                  <strong>{i.title}</strong>
                  <span className="row">
                    <Badge tone={i.status === 'done' ? 'success' : i.status === 'active' ? 'primary' : 'default'}>{i.status}</Badge>
                    <span className="small muted">{i.owner}</span>
                  </span>
                </div>
                <ProgressBar value={i.progress} label={`${i.title} progress`} />
                <div className="row">
                  <Button size="sm" variant="ghost" disabled={i.progress >= 100} onClick={() => save.run({ ...i, progress: Math.min(100, i.progress + 10), status: i.progress + 10 >= 100 ? 'done' : 'active' })}>
                    +10% progress
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <form
            className="row"
            style={{ alignItems: 'flex-end', marginTop: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!f.title.trim()) return;
              if (await save.run({ id: `ci-${Date.now().toString(36)}`, organizationId: orgId, title: f.title, owner: f.owner || 'People team', progress: 0, status: 'planned' })) setF({ title: '', owner: '' });
            }}
          >
            <TextField label="New initiative" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <TextField label="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
            <SelectField label="Status" value="planned" onChange={() => undefined} options={[{ value: 'planned', label: 'planned' }]} disabled />
            <Button type="submit" variant="primary">Add</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

export default function CulturePage() {
  return (
    <OrgGate permission="engagement.manage" module="engagement">
      <Culture />
    </OrgGate>
  );
}
