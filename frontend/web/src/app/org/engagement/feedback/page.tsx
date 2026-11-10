'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatDateTime, type FeedbackItem } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan } from '@/lib/store/selectors';
import { useOrgId } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, InfoNotice, PageHeader } from '@/components/ui/primitives';
import { Checkbox, SelectField, TextArea } from '@/components/ui/form';

function Feedback() {
  const orgId = useOrgId()!;
  const canManage = useCan('engagement.manage');
  const items = useDemoStore(useShallow((s) => s.feedback.filter((f) => f.organizationId === orgId)));
  const [f, setF] = useState({ category: 'idea' as FeedbackItem['category'], body: '', anonymous: true });
  const submit = useAction(() => getService().engagement.submitFeedback({ organizationId: orgId, ...f }), { success: 'Feedback submitted — thank you' });
  const setStatus = useAction((id: string, s: FeedbackItem['status']) => getService().engagement.setFeedbackStatus(id, s), { success: 'Status updated' });
  return (
    <>
      <PageHeader title="Feedback" description="Ideas, concerns, praise and questions from employees." />
      <div className="grid-2">
        <Card title="Share feedback">
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await submit.run()) setF({ ...f, body: '' });
            }}
          >
            <SelectField
              label="Category"
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value as FeedbackItem['category'] })}
              options={['idea', 'concern', 'praise', 'question'].map((c) => ({ value: c, label: c }))}
            />
            <TextArea label="Your feedback" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={1000} />
            <Checkbox label="Submit anonymously" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} />
            <InfoNotice>Demo: anonymity is a display setting only. Real anonymity guarantees need backend design.</InfoNotice>
            <div>
              <Button type="submit" variant="primary" pending={submit.pending}>
                Submit
              </Button>
            </div>
          </form>
        </Card>
        {canManage ? (
          <div className="stack">
            {items.map((i) => (
              <Card key={i.id} as="article">
                <div className="row-between">
                  <Badge tone="primary">{i.category}</Badge>
                  <span className="small muted">
                    {formatDateTime(i.at)} · {i.anonymous ? 'anonymous' : 'named'}
                  </span>
                </div>
                <p className="small" style={{ marginTop: 6 }}>
                  {i.body}
                </p>
                <div className="row" style={{ marginTop: 6 }}>
                  {(['new', 'acknowledged', 'actioned'] as const).map((s) => (
                    <Button key={s} size="sm" variant={i.status === s ? 'primary' : 'ghost'} aria-pressed={i.status === s} onClick={() => setStatus.run(i.id, s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card title="What happens next">
            <p className="small muted">The people team reviews feedback weekly and marks items acknowledged or actioned.</p>
          </Card>
        )}
      </div>
    </>
  );
}

export default function FeedbackPage() {
  return (
    <OrgGate permission="engagement.participate" module="engagement">
      <Feedback />
    </OrgGate>
  );
}
