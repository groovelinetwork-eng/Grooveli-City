'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEMO_TODAY, addDays, formatDate, type TeamActivity } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan } from '@/lib/store/selectors';
import { useOrgId, useSelfEmployee } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, PageHeader } from '@/components/ui/primitives';
import { SelectField, TextField } from '@/components/ui/form';

function Activities() {
  const orgId = useOrgId()!;
  const me = useSelfEmployee();
  const canManage = useCan('engagement.manage');
  const list = useDemoStore(useShallow((s) => s.activities.filter((a) => a.organizationId === orgId)));
  const [f, setF] = useState({ title: '', date: addDays(DEMO_TODAY, 7), location: '', kind: 'social' as TeamActivity['kind'] });
  const save = useAction(() => getService().engagement.saveActivity({ id: `act-${Date.now().toString(36)}`, organizationId: orgId, ...f }), { success: 'Activity created' });
  const rsvp = useAction((id: string) => getService().engagement.toggleActivityRsvp(id, me!.id));
  return (
    <>
      <PageHeader title="Team activities & events" description="Social, learning, wellbeing and volunteering activities." />
      <div className="grid-2">
        <div className="stack">
          {[...list].sort((a, b) => a.date.localeCompare(b.date)).map((a) => {
            const going = !!me && a.rsvps.includes(me.id);
            return (
              <Card key={a.id} as="article" title={<h2 style={{ fontSize: '1.05rem' }}>{a.title}</h2>} actions={<Badge>{a.kind}</Badge>}>
                <p className="small muted">
                  {formatDate(a.date)} · {a.location} · {a.rsvps.length} going
                </p>
                {me ? (
                  <div style={{ marginTop: 8 }}>
                    <Button size="sm" variant={going ? 'default' : 'primary'} aria-pressed={going} onClick={() => rsvp.run(a.id)}>
                      {going ? '✓ Going' : 'RSVP'}
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
        {canManage ? (
          <Card title="Plan an activity">
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await save.run()) setF({ ...f, title: '', location: '' });
              }}
            >
              <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <TextField label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              <TextField label="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} hint="Can be a city venue, e.g. Grooveli Plaza" />
              <SelectField label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as TeamActivity['kind'] })} options={['social', 'learning', 'wellbeing', 'volunteering'].map((k) => ({ value: k, label: k }))} />
              <div>
                <Button type="submit" variant="primary" pending={save.pending}>
                  Create
                </Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}

export default function ActivitiesPage() {
  return (
    <OrgGate permission="engagement.participate" module="engagement">
      <Activities />
    </OrgGate>
  );
}
