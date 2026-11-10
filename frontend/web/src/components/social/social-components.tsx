'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDateTime, getDistrict, type CityEvent, type Community, type PersonalityTraits } from '@grooveli/frontend-domain';
import { useDemoStore, useHydrated } from '@/lib/store/store';
import { Badge, LinkButton } from '@/components/ui/primitives';

/** Social interactions need a demo session; guests get a sign-in prompt. */
export function RequireSessionForAction({ children, next }: { children: ReactNode; next: string }) {
  const hydrated = useHydrated();
  const session = useDemoStore((s) => s.session);
  if (!hydrated) return null;
  if (!session)
    return (
      <LinkButton href={`/login?next=${encodeURIComponent(next)}`} variant="primary" size="sm">
        Sign in to take part
      </LinkButton>
    );
  return <>{children}</>;
}

/**
 * Social-only personalisation: overlap between a community's affinity and the
 * user's optional personality preferences. Never used for jobs or hiring.
 */
export function socialAffinity(traits: PersonalityTraits | null, affinity: Partial<PersonalityTraits>): number {
  if (!traits) return 0;
  return (Object.entries(affinity) as [keyof PersonalityTraits, string][]).filter(([k, v]) => traits[k] === v).length;
}

export function EventCard({ event, attending }: { event: CityEvent; attending: boolean }) {
  return (
    <article className="card stack" style={{ ['--gap' as string]: '6px' }}>
      <div className="row-between">
        <Badge tone="primary">{event.kind.replace('-', ' ')}</Badge>
        {attending ? <Badge tone="success">Going</Badge> : null}
      </div>
      <h3>
        <Link href={`/social/events/${event.id}`}>{event.title}</Link>
      </h3>
      <p className="small muted">
        {formatDateTime(event.start)} · {event.venue} · {getDistrict(event.district).name}
      </p>
      <p className="small">{event.description}</p>
      <p className="small muted">
        {event.attendeeCount}/{event.capacity} attending · hosted by {event.host}
      </p>
    </article>
  );
}

export function CommunityCard({ community, joined, recommended }: { community: Community; joined: boolean; recommended?: boolean }) {
  return (
    <article className="card stack" style={{ ['--gap' as string]: '6px' }}>
      <div className="row">
        <Badge>{community.topic}</Badge>
        {joined ? <Badge tone="success">Member</Badge> : null}
        {recommended ? <Badge tone="primary" title="Based on your optional personality preferences (social only)">Suggested for you</Badge> : null}
      </div>
      <h3>
        <Link href={`/social/communities/${community.id}`}>{community.name}</Link>
      </h3>
      <p className="small">{community.description}</p>
      <p className="small muted">
        {community.members.toLocaleString()} members · meets in {getDistrict(community.district).name}
      </p>
    </article>
  );
}

export function SocialNav() {
  const pending = useDemoStore((s) => s.invitations.filter((i) => i.direction === 'received' && i.status === 'pending').length);
  return (
    <nav aria-label="Social" className="row" style={{ marginBottom: 16 }}>
      <Link className="btn btn-sm" href="/social">
        Discover
      </Link>
      <Link className="btn btn-sm" href="/social/people">
        People & connections
      </Link>
      <Link className="btn btn-sm" href="/social/invitations">
        Invitations {pending ? <Badge tone="danger">{pending}</Badge> : null}
      </Link>
      <Link className="btn btn-sm" href="/app/settings">
        Privacy & safety
      </Link>
    </nav>
  );
}
