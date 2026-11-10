'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { SOCIAL_PROFILES, formatDateTime, getDistrict } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, EmptyState, LinkButton, MockNotice } from '@/components/ui/primitives';
import { SelectField } from '@/components/ui/form';
import { RequireSessionForAction, SocialNav } from '@/components/social/social-components';
import { EnterCityButton } from '@/components/enter-city-button';

export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const event = useDemoStore((s) => s.events.find((e) => e.id === eventId));
  const attending = useDemoStore((s) => s.rsvps.includes(eventId));
  const blocked = useDemoStore((s) => s.privacy.blockedIds);
  const connections = useDemoStore((s) => s.connections);
  const [invitee, setInvitee] = useState('');
  const rsvp = useAction(() => getService().social.toggleRsvp(eventId), { success: (r) => (r.attending ? "You're going (simulated RSVP)" : 'RSVP cancelled') });
  const invite = useAction((name: string) => getService().social.sendInvitation(eventId, name), { success: 'Invitation sent (simulated)' });

  if (!event) return <div className="container section"><EmptyState title="Event not found" action={<LinkButton href="/social">All events</LinkButton>} /></div>;
  const full = event.attendeeCount >= event.capacity && !attending;
  const invitable = SOCIAL_PROFILES.filter((p) => !blocked.includes(p.id) && connections.some((c) => c.profileId === p.id && c.status === 'connected'));

  return (
    <div className="container section">
      <SocialNav />
      <div className="stack" style={{ ['--gap' as string]: '16px' }}>
        <nav aria-label="Breadcrumb" className="small">
          <Link href="/social">Events</Link> / {event.title}
        </nav>
        <header className="row-between">
          <div>
            <h1>{event.title}</h1>
            <p className="muted">
              {formatDateTime(event.start)} – {formatDateTime(event.end)} · {event.venue}, {getDistrict(event.district).name}
            </p>
            <div className="row" style={{ marginTop: 6 }}>
              <Badge tone="primary">{event.kind.replace('-', ' ')}</Badge>
              {event.tags.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          </div>
          <div className="row">
            <RequireSessionForAction next={`/social/events/${eventId}`}>
              <Button variant={attending ? 'default' : 'primary'} pending={rsvp.pending} disabled={full} onClick={() => rsvp.run()} aria-pressed={attending}>
                {attending ? '✓ Going — cancel RSVP' : full ? 'Event full' : 'RSVP'}
              </Button>
            </RequireSessionForAction>
            <EnterCityButton district={event.district} label="See it in the city" />
          </div>
        </header>
        <MockNotice title="Simulated event">Attendance and venue are synthetic; no tickets or calendar invites are issued.</MockNotice>
        <div className="grid-2">
          <Card title="About">
            <p>{event.description}</p>
            <p className="small muted" style={{ marginTop: 8 }}>
              Hosted by {event.hostOrganizationId ? <Link href={`/companies/${event.hostOrganizationId}`}>{event.host}</Link> : event.host} ·{' '}
              {event.attendeeCount}/{event.capacity} attending
            </p>
            {event.communityId ? (
              <p className="small" style={{ marginTop: 8 }}>
                Organised with the <Link href={`/social/communities/${event.communityId}`}>community</Link>.
              </p>
            ) : null}
          </Card>
          <Card title="Invite a connection">
            <RequireSessionForAction next={`/social/events/${eventId}`}>
              {invitable.length === 0 ? (
                <p className="small muted">
                  Connect with people first — <Link href="/social/people">find people</Link>.
                </p>
              ) : (
                <form
                  className="row"
                  style={{ alignItems: 'flex-end' }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!invitee) return;
                    await invite.run(invitee);
                    setInvitee('');
                  }}
                >
                  <SelectField label="Connection" value={invitee} onChange={(e) => setInvitee(e.target.value)} options={[{ value: '', label: 'Choose…' }, ...invitable.map((p) => ({ value: p.name, label: p.name }))]} />
                  <Button type="submit" disabled={!invitee} pending={invite.pending}>
                    Send invitation
                  </Button>
                </form>
              )}
            </RequireSessionForAction>
          </Card>
        </div>
      </div>
    </div>
  );
}
