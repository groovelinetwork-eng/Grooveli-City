'use client';

import { useState } from 'react';
import { formatDate, type Policy } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg, useCan } from '@/lib/store/selectors';
import { useOrgEmployees } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar } from '@/components/ui/primitives';
import { SelectField, TextArea, TextField } from '@/components/ui/form';
import { Dialog } from '@/components/ui/widgets';

type Draft = { id?: string; title: string; category: Policy['category']; body: string };

function Policies() {
  const { organization, workspace } = useActiveOrg();
  const headcount = useOrgEmployees().length;
  const acks = useDemoStore((s) => s.policyAcks);
  const canManage = useCan('hr.policies.manage');
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useAction((d: Draft) => getService().hr.savePolicy(organization!.id, d), { success: 'Policy saved' });
  const ack = useAction((id: string) => getService().hr.acknowledgePolicy(id), { success: 'Acknowledged' });
  const policies = workspace?.policies ?? [];
  return (
    <>
      <PageHeader
        title="HR policies"
        description="Publish policies and track acknowledgement."
        actions={canManage ? <Button variant="primary" onClick={() => setDraft({ title: '', category: 'other', body: '' })}>New policy</Button> : null}
      />
      {policies.length === 0 ? (
        <EmptyState title="No policies yet" />
      ) : (
        <div className="grid" style={{ ['--min' as string]: '320px' }}>
          {policies.map((p) => (
            <Card key={p.id} as="article" title={<h2 style={{ fontSize: '1.05rem' }}>{p.title}</h2>} actions={<Badge>{p.category}</Badge>}>
              <p className="small">{p.body}</p>
              <p className="small muted" style={{ marginTop: 8 }}>
                Updated {formatDate(p.updatedAt)} · {p.acknowledgements}/{headcount} acknowledged
              </p>
              <ProgressBar value={p.acknowledgements} max={headcount} label={`${p.title} acknowledgement rate`} />
              <div className="row" style={{ marginTop: 10 }}>
                {acks.includes(p.id) ? (
                  <Badge tone="success">You acknowledged</Badge>
                ) : (
                  <Button size="sm" onClick={() => ack.run(p.id)}>
                    Acknowledge
                  </Button>
                )}
                {canManage ? (
                  <Button size="sm" variant="ghost" onClick={() => setDraft({ id: p.id, title: p.title, category: p.category, body: p.body })}>
                    Edit
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit policy' : 'New policy'}
        actions={
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              variant="primary"
              pending={save.pending}
              onClick={async () => {
                if (draft && (await save.run(draft)) !== undefined) setDraft(null);
              }}
            >
              Publish
            </Button>
          </>
        }
      >
        {draft ? (
          <>
            <TextField label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <SelectField
              label="Category"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as Policy['category'] })}
              options={['leave', 'conduct', 'remote-work', 'benefits', 'security', 'other'].map((c) => ({ value: c, label: c }))}
            />
            <TextArea label="Policy text" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={8} />
          </>
        ) : null}
      </Dialog>
    </>
  );
}

export default function PoliciesPage() {
  return (
    <OrgGate permission="hr.directory.view" module="hr">
      <Policies />
    </OrgGate>
  );
}
