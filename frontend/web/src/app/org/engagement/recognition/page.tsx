'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatDateTime } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg, usePersona } from '@/lib/store/selectors';
import { useEmployeeName, useOrgEmployees, useOrgId } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, PageHeader } from '@/components/ui/primitives';
import { SelectField, TextArea } from '@/components/ui/form';

function Recognition() {
  const orgId = useOrgId()!;
  const { organization } = useActiveOrg();
  const persona = usePersona();
  const employees = useOrgEmployees();
  const empName = useEmployeeName();
  const wall = useDemoStore(useShallow((s) => s.recognition.filter((r) => r.organizationId === orgId)));
  const [f, setF] = useState({ to: employees[0]?.id ?? '', value: organization?.values[0] ?? 'Teamwork', message: '' });
  const give = useAction(() => getService().engagement.giveRecognition({ organizationId: orgId, from: persona?.displayName ?? 'A colleague', toEmployeeId: f.to, value: f.value, message: f.message }), { success: 'Recognition shared 🙌' });
  const react = useAction((id: string) => getService().engagement.reactToRecognition(id));
  const counts = new Map<string, number>();
  for (const r of wall) counts.set(r.toEmployeeId, (counts.get(r.toEmployeeId) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <>
      <PageHeader title="Recognition" description="Celebrate colleagues for living your values." />
      <div className="grid-2">
        <div className="stack">
          {wall.map((r) => (
            <Card key={r.id} as="article">
              <div className="row-between">
                <strong>
                  {r.from} → {empName(r.toEmployeeId)}
                </strong>
                <Badge tone="primary">{r.value}</Badge>
              </div>
              <p className="small" style={{ marginTop: 6 }}>
                {r.message}
              </p>
              <div className="row-between" style={{ marginTop: 6 }}>
                <span className="small muted">{formatDateTime(r.at)}</span>
                <Button size="sm" variant="ghost" onClick={() => react.run(r.id)} aria-label={`Applaud, ${r.reactions} so far`}>
                  👏 {r.reactions}
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <div className="stack">
          <Card title="Give recognition">
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await give.run()) setF({ ...f, message: '' });
              }}
            >
              <SelectField label="Colleague" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} options={employees.map((e) => ({ value: e.id, label: e.name }))} />
              <SelectField label="Value" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} options={(organization?.values ?? ['Teamwork']).map((v) => ({ value: v, label: v }))} />
              <TextArea label="Message" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={400} />
              <div>
                <Button type="submit" variant="primary" pending={give.pending}>
                  Share
                </Button>
              </div>
            </form>
          </Card>
          <Card title="Most recognised">
            <ol style={{ paddingLeft: 20 }}>
              {top.map(([id, n]) => (
                <li key={id}>
                  {empName(id)} — {n}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function RecognitionPage() {
  return (
    <OrgGate permission="engagement.participate" module="engagement">
      <Recognition />
    </OrgGate>
  );
}
