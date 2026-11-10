'use client';

import Link from 'next/link';
import { formatDateTime } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { RequireSessionForAction, SocialNav } from '@/components/social/social-components';

export default function InvitationsPage() {
  const invitations = useDemoStore((s) => s.invitations);
  const events = useDemoStore((s) => s.events);
  const allow = useDemoStore((s) => s.privacy.allowInvitations);
  const respond = useAction((id: string, accept: boolean) => getService().social.respondInvitation(id, accept), {
    success: 'Response saved (simulated)',
  });
  const received = invitations.filter((i) => i.direction === 'received');
  const sent = invitations.filter((i) => i.direction === 'sent');
  const title = (eventId: string) => events.find((e) => e.id === eventId)?.title ?? eventId;
  return (
    <div className="container section">
      <PageHeader title="Invitations" description="Event invitations from and to your connections." />
      <SocialNav />
      <RequireSessionForAction next="/social/invitations">
        <div className="grid-2">
          <Card title="Received">
            {allow === 'nobody' ? <p className="small muted">You&apos;ve turned off invitations in Privacy & safety.</p> : null}
            {received.length === 0 ? (
              <EmptyState title="No invitations" />
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
                {received.map((i) => (
                  <li key={i.id} className="row-between">
                    <span>
                      <strong>{i.from}</strong> invited you to <Link href={`/social/events/${i.eventId}`}>{title(i.eventId)}</Link>
                      <span className="small muted"> · {formatDateTime(i.at)}</span>
                    </span>
                    {i.status === 'pending' ? (
                      <span className="row">
                        <Button size="sm" variant="primary" onClick={() => respond.run(i.id, true)}>
                          Accept
                        </Button>
                        <Button size="sm" onClick={() => respond.run(i.id, false)}>
                          Decline
                        </Button>
                      </span>
                    ) : (
                      <Badge tone={i.status === 'accepted' ? 'success' : 'default'}>{i.status}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Sent">
            {sent.length === 0 ? (
              <p className="small muted">You haven&apos;t invited anyone yet.</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
                {sent.map((i) => (
                  <li key={i.id} className="row-between">
                    <span>
                      {i.to} → <Link href={`/social/events/${i.eventId}`}>{title(i.eventId)}</Link>
                    </span>
                    <Badge tone="mock">pending (simulated)</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </RequireSessionForAction>
    </div>
  );
}
