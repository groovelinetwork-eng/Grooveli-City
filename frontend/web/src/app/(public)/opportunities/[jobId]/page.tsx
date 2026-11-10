'use client';

import Link from 'next/link';
import { use } from 'react';
import { formatDate, getDistrict } from '@grooveli/frontend-domain';
import { useDemoStore, useHydrated } from '@/lib/store/store';
import { Badge, Card, EmptyState, LinkButton, MockNotice } from '@/components/ui/primitives';
import { OrgLogo } from '@/components/ui/avatar';
import { salaryRange } from '@/components/jobs/job-components';
import { EnterCityButton } from '@/components/enter-city-button';

export default function PublicJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const hydrated = useHydrated();
  const job = useDemoStore((s) => s.jobs.find((j) => j.id === jobId));
  const org = useDemoStore((s) => s.organizations.find((o) => o.id === job?.organizationId));
  const session = useDemoStore((s) => s.session);

  if (!job || (job.status !== 'published' && hydrated)) {
    return (
      <div className="container section">
        <EmptyState title="This job isn't available" action={<LinkButton href="/opportunities">Browse open roles</LinkButton>}>
          It may have closed or never existed.
        </EmptyState>
      </div>
    );
  }

  const applyHref =
    session?.personaId === 'candidate' ? `/app/jobs/${job.id}?apply=1` : `/login?next=${encodeURIComponent(`/app/jobs/${job.id}?apply=1`)}`;

  return (
    <div className="container section stack" style={{ ['--gap' as string]: '20px' }}>
      <nav aria-label="Breadcrumb" className="small">
        <Link href="/opportunities">Opportunities</Link> / {job.title}
      </nav>
      <header className="row-between">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {org ? <OrgLogo glyph={org.logoGlyph} color={org.logoColor} name={org.name} size={56} /> : null}
          <div>
            <h1>{job.title}</h1>
            <p className="muted">
              {org ? <Link href={`/companies/${org.id}`}>{org.name}</Link> : null} · {job.department} · {job.location}
            </p>
            <div className="row" style={{ marginTop: 8 }}>
              <Badge>{job.workMode}</Badge>
              <Badge>{job.employmentType}</Badge>
              <Badge>{job.level}</Badge>
              <Badge tone="primary">{salaryRange(job)}</Badge>
            </div>
          </div>
        </div>
        <div className="row">
          <LinkButton href={applyHref} variant="primary">
            {session?.personaId === 'candidate' ? 'Check fit & apply' : 'Sign in to apply'}
          </LinkButton>
          <EnterCityButton district={job.district} organizationId={job.organizationId} label="See HQ in the city" />
        </div>
      </header>
      <MockNotice title="Synthetic listing">This vacancy is demo data. Applications are simulated and never reach an employer.</MockNotice>
      <div className="grid-2">
        <Card title="About the role">
          <p>{job.description}</p>
          <h3 style={{ marginTop: 16 }}>Responsibilities</h3>
          <ul style={{ paddingLeft: 20 }}>
            {job.responsibilities.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
        <Card title="Requirements">
          <dl className="stack" style={{ ['--gap' as string]: '8px' }}>
            <div>
              <dt className="small muted">Skills</dt>
              <dd className="row">{job.skills.map((s) => <Badge key={s}>{s}</Badge>)}</dd>
            </div>
            <div>
              <dt className="small muted">Experience</dt>
              <dd>{job.minYears}+ years</dd>
            </div>
            <div>
              <dt className="small muted">Mandatory qualifications</dt>
              <dd>{job.requiredQualifications.length ? job.requiredQualifications.join(', ') : 'None'}</dd>
            </div>
            <div>
              <dt className="small muted">District</dt>
              <dd>{getDistrict(job.district).name}</dd>
            </div>
            <div>
              <dt className="small muted">Posted / closes</dt>
              <dd>
                {formatDate(job.postedOn)} · {formatDate(job.closesOn)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
