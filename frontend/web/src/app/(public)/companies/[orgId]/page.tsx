'use client';

import Link from 'next/link';
import { use } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatDate, getDistrict } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { Badge, Card, EmptyState, LinkButton } from '@/components/ui/primitives';
import { OrgLogo } from '@/components/ui/avatar';
import { salaryRange } from '@/components/jobs/job-components';
import { EnterCityButton } from '@/components/enter-city-button';

const CULTURE_LABELS: Record<string, string> = {
  environment: 'Workplace environment',
  leadership: 'Leadership & management style',
  collaboration: 'Team collaboration',
  development: 'Employee development',
  inclusion: 'Diversity & inclusion',
  workLife: 'Work-life balance',
};

export default function CompanyPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const org = useDemoStore((s) => s.organizations.find((o) => o.id === orgId));
  const jobs = useDemoStore(useShallow((s) => s.jobs.filter((j) => j.organizationId === orgId && j.status === 'published')));
  const announcements = useDemoStore(useShallow((s) => s.announcements.filter((a) => a.organizationId === orgId && a.audience === 'public-hq')));
  const events = useDemoStore(useShallow((s) => s.events.filter((e) => e.hostOrganizationId === orgId)));
  if (!org) {
    return (
      <div className="container section">
        <EmptyState title="Company not found" action={<LinkButton href="/companies">All companies</LinkButton>} />
      </div>
    );
  }
  return (
    <div className="container section stack" style={{ ['--gap' as string]: '20px' }}>
      <nav aria-label="Breadcrumb" className="small">
        <Link href="/companies">Companies</Link> / {org.name}
      </nav>
      <header className="row-between">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <OrgLogo glyph={org.logoGlyph} color={org.logoColor} name={org.name} size={64} />
          <div>
            <h1>{org.name}</h1>
            <p className="muted">
              {org.tagline} · {org.industry}
            </p>
            <div className="row" style={{ marginTop: 6 }}>
              <Badge>{org.size} people</Badge>
              <Badge>{org.workArrangements.join(' / ')}</Badge>
              <Badge>{getDistrict(org.district).name}</Badge>
              {org.verified ? <Badge tone="success">Verified (demo)</Badge> : <Badge tone="warning">Unverified organisation</Badge>}
            </div>
          </div>
        </div>
        <EnterCityButton district={org.district} organizationId={org.id} label="Visit virtual HQ" className="btn btn-primary" />
      </header>

      <div className="grid-2">
        <Card title="About">
          <p>{org.description}</p>
          <dl className="stack" style={{ ['--gap' as string]: '6px', marginTop: 12 }}>
            <div>
              <dt className="small muted">Structure</dt>
              <dd>{org.structure}</dd>
            </div>
            <div>
              <dt className="small muted">Headquarters</dt>
              <dd>{org.headquarters}</dd>
            </div>
            <div>
              <dt className="small muted">Website</dt>
              <dd>{org.website} (fictional)</dd>
            </div>
          </dl>
        </Card>
        <Card title="Values & benefits">
          <div className="row">{org.values.map((v) => <Badge key={v} tone="primary">{v}</Badge>)}</div>
          <ul style={{ paddingLeft: 20, marginTop: 12 }}>
            {org.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="What it's like to work here">
        <dl className="grid" style={{ ['--min' as string]: '260px' }}>
          {Object.entries(org.culture).map(([k, v]) => (
            <div key={k}>
              <dt className="small muted">{CULTURE_LABELS[k] ?? k}</dt>
              <dd>{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={`Open positions (${jobs.length})`}>
        {jobs.length === 0 ? (
          <EmptyState title="No open positions right now" />
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {jobs.map((j) => (
              <li key={j.id} className="row-between">
                <Link href={`/opportunities/${j.id}`}>{j.title}</Link>
                <span className="small muted">
                  {j.workMode} · {j.employmentType} · {salaryRange(j)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Announcements">
          {announcements.length === 0 ? (
            <p className="muted small">No public announcements.</p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {announcements.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  <p className="small muted">
                    {formatDate(a.publishedAt)} — {a.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Events hosted">
          {events.length === 0 ? (
            <p className="muted small">No upcoming events.</p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {events.map((e) => (
                <li key={e.id} className="row-between">
                  <Link href={`/social/events/${e.id}`}>{e.title}</Link>
                  <span className="small muted">{formatDate(e.start)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
