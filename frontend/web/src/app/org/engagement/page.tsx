'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatDateTime, type Announcement } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan, usePersona } from '@/lib/store/selectors';
import { useDepartments, useDeptName, useOrgId } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, InfoNotice, PageHeader } from '@/components/ui/primitives';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';

function Announcements() {
  const orgId = useOrgId()!;
  const persona = usePersona();
  const deps = useDepartments();
  const deptName = useDeptName();
  const canManage = useCan('engagement.manage');
  const list = useDemoStore(useShallow((s) => s.announcements.filter((a) => a.organizationId === orgId)));
  const [f, setF] = useState({ title: '', body: '', audience: 'all' as Announcement['audience'], departmentId: '', pinned: false });
  const publish = useAction(
    () =>
      getService().engagement.publishAnnouncement({
        organizationId: orgId,
        title: f.title,
        body: f.body,
        author: persona?.displayName ?? 'Admin',
        audience: f.audience,
        departmentId: f.audience === 'department' ? f.departmentId : undefined,
        pinned: f.pinned,
      }),
    { success: f.audience === 'public-hq' ? 'Published — visible on the public company page and virtual HQ' : 'Announcement published (no emails sent)' },
  );
  const remove = useAction((id: string) => getService().engagement.deleteAnnouncement(id), { success: 'Announcement removed' });
  const sorted = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt));
  return (
    <>
      <PageHeader title="Announcements & communication" description="Share news with everyone, a department, or publicly on your virtual HQ." />
      <div className="grid-2">
        <div className="stack">
          {sorted.length === 0 ? <EmptyState title="No announcements" /> : null}
          {sorted.map((a) => (
            <Card key={a.id} as="article" title={<h2 style={{ fontSize: '1.05rem' }}>{a.pinned ? '📌 ' : ''}{a.title}</h2>} actions={<Badge tone={a.audience === 'public-hq' ? 'primary' : 'default'}>{a.audience === 'department' ? deptName(a.departmentId) : a.audience}</Badge>}>
              <p className="small">{a.body}</p>
              <div className="row-between" style={{ marginTop: 8 }}>
                <span className="small muted">
                  {a.author} · {formatDateTime(a.publishedAt)}
                </span>
                {canManage ? (
                  <Button size="sm" variant="ghost" onClick={() => remove.run(a.id)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
        {canManage ? (
          <Card title="New announcement">
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await publish.run()) setF({ title: '', body: '', audience: 'all', departmentId: '', pinned: false });
              }}
            >
              <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} />
              <TextArea label="Message" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={1000} />
              <SelectField
                label="Audience"
                value={f.audience}
                onChange={(e) => setF({ ...f, audience: e.target.value as Announcement['audience'] })}
                options={[
                  { value: 'all', label: 'All employees' },
                  { value: 'department', label: 'One department' },
                  { value: 'public-hq', label: 'Public (company page & virtual HQ)' },
                ]}
              />
              {f.audience === 'department' ? <SelectField label="Department" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} options={deps.map((d) => ({ value: d.id, label: d.name }))} /> : null}
              {f.audience === 'public-hq' ? <InfoNotice>Public announcements are visible to anyone, including candidates exploring your HQ. Don&apos;t include private information.</InfoNotice> : null}
              <Checkbox label="Pin to top" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />
              <div>
                <Button type="submit" variant="primary" pending={publish.pending}>
                  Publish
                </Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}

export default function EngagementPage() {
  return (
    <OrgGate permission="engagement.participate" module="engagement">
      <Announcements />
    </OrgGate>
  );
}
