'use client';

import { useMemo, useState } from 'react';
import { DISTRICTS, type DistrictId } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { EmptyState, MockNotice, PageHeader } from '@/components/ui/primitives';
import { SelectField } from '@/components/ui/form';
import { CommunityCard, EventCard, SocialNav, socialAffinity } from '@/components/social/social-components';
import { EnterCityButton } from '@/components/enter-city-button';

export default function SocialPage() {
  const events = useDemoStore((s) => s.events);
  const communities = useDemoStore((s) => s.communities);
  const rsvps = useDemoStore((s) => s.rsvps);
  const joined = useDemoStore((s) => s.joinedCommunities);
  const traits = useDemoStore((s) => (s.session?.personaId === 'candidate' ? s.candidate.personality : null));
  const [district, setDistrict] = useState<DistrictId | ''>('');
  const [kind, setKind] = useState('');
  const shownEvents = useMemo(
    () => events.filter((e) => (!district || e.district === district) && (!kind || e.kind === kind)).sort((a, b) => a.start.localeCompare(b.start)),
    [events, district, kind],
  );
  const rankedCommunities = useMemo(
    () => [...communities].map((c) => ({ c, score: socialAffinity(traits, c.affinity) })).sort((a, b) => b.score - a.score || b.c.members - a.c.members),
    [communities, traits],
  );

  return (
    <div className="container section">
      <PageHeader
        title="Events & communities"
        description="Career fairs, meetups, workshops and professional communities across Grooveli City."
        actions={<EnterCityButton district="plaza" label="See live city events" className="btn btn-primary" />}
      />
      <SocialNav />
      <div className="stack" style={{ ['--gap' as string]: '24px' }}>
        <MockNotice title="Simulated community">Events, attendee counts and community posts are synthetic. RSVPs and posts stay in this browser.</MockNotice>
        <section aria-labelledby="events-h" className="stack">
          <div className="row-between">
            <h2 id="events-h">Upcoming events</h2>
            <div className="row">
              <SelectField
                label="District"
                value={district}
                onChange={(e) => setDistrict(e.target.value as DistrictId | '')}
                options={[{ value: '', label: 'All' }, ...DISTRICTS.map((d) => ({ value: d.id, label: d.name }))]}
              />
              <SelectField
                label="Type"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                options={[{ value: '', label: 'All' }, ...['career-fair', 'meetup', 'workshop', 'social', 'conference'].map((k) => ({ value: k, label: k.replace('-', ' ') }))]}
              />
            </div>
          </div>
          {shownEvents.length === 0 ? (
            <EmptyState title="No events match" />
          ) : (
            <div className="grid" style={{ ['--min' as string]: '280px' }}>
              {shownEvents.map((e) => (
                <EventCard key={e.id} event={e} attending={rsvps.includes(e.id)} />
              ))}
            </div>
          )}
        </section>
        <section aria-labelledby="com-h" className="stack">
          <h2 id="com-h">Communities</h2>
          {traits ? (
            <p className="small muted">Suggestions use your optional personality preferences — for social discovery only, never for jobs.</p>
          ) : null}
          <div className="grid" style={{ ['--min' as string]: '280px' }}>
            {rankedCommunities.map(({ c, score }) => (
              <CommunityCard key={c.id} community={c} joined={joined.includes(c.id)} recommended={score > 0} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
