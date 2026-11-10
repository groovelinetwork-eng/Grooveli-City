'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime, type NotificationItem } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ChoiceChips } from '@/components/ui/form';

type Filter = 'all' | 'unread' | NotificationItem['kind'];

export default function NotificationsPage() {
  const items = useDemoStore((s) => s.notifications);
  const [filter, setFilter] = useState<Filter>('all');
  const mark = useAction((ids: string[] | 'all') => getService().career.markNotificationsRead(ids));
  const shown = items.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : n.kind === filter));
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates on applications, interviews, missions and the community. In-app only — no email or SMS is sent in demo mode."
        actions={
          <Button size="sm" onClick={() => mark.run('all')} disabled={!items.some((n) => !n.read)}>
            Mark all read
          </Button>
        }
      />
      <div className="stack">
        <ChoiceChips<Filter>
          legend="Show"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={(['all', 'unread', 'application', 'interview', 'mission', 'social', 'system'] as Filter[]).map((v) => ({ value: v, label: v }))}
        />
        {shown.length === 0 ? (
          <EmptyState title="You're all caught up" />
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }} aria-live="polite">
            {shown.map((n) => (
              <li key={n.id}>
                <Card as="article">
                  <div className="row-between">
                    <div>
                      <strong>{n.title}</strong> {!n.read ? <Badge tone="primary">New</Badge> : null}
                      <p className="small muted">
                        {formatDateTime(n.at)} · {n.body}
                      </p>
                    </div>
                    <div className="row">
                      {n.href ? <Link href={n.href} onClick={() => mark.run([n.id])}>Open</Link> : null}
                      {!n.read ? (
                        <Button size="sm" variant="ghost" onClick={() => mark.run([n.id])}>
                          Mark read
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
