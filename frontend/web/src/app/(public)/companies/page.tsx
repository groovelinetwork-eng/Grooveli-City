'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DISTRICTS } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { Badge, EmptyState, PageHeader } from '@/components/ui/primitives';
import { OrgLogo } from '@/components/ui/avatar';
import { SelectField, TextField } from '@/components/ui/form';

export default function CompaniesPage() {
  const orgs = useDemoStore((s) => s.organizations);
  const jobs = useDemoStore((s) => s.jobs);
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const list = useMemo(
    () =>
      orgs.filter(
        (o) => (!q || `${o.name} ${o.industry} ${o.values.join(' ')}`.toLowerCase().includes(q.toLowerCase())) && (!district || o.district === district),
      ),
    [orgs, q, district],
  );
  return (
    <div className="container section stack" style={{ ['--gap' as string]: '16px' }}>
      <PageHeader title="Companies" description="Understand an organisation's culture, values and ways of working before you apply." />
      <form className="card grid" role="search" aria-label="Filter companies" style={{ ['--min' as string]: '200px' }} onSubmit={(e) => e.preventDefault()}>
        <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, industry or value" />
        <SelectField
          label="District"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          options={[{ value: '', label: 'All districts' }, ...DISTRICTS.filter((d) => d.industries.length).map((d) => ({ value: d.id, label: d.name }))]}
        />
      </form>
      {list.length === 0 ? (
        <EmptyState title="No companies match" />
      ) : (
        <div className="grid" style={{ ['--min' as string]: '300px' }}>
          {list.map((o) => {
            const open = jobs.filter((j) => j.organizationId === o.id && j.status === 'published').length;
            return (
              <Link key={o.id} href={`/companies/${o.id}`} className="card card-interactive stack">
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <OrgLogo glyph={o.logoGlyph} color={o.logoColor} name={o.name} />
                  <div>
                    <h2 style={{ fontSize: '1.05rem' }}>{o.name}</h2>
                    <p className="small muted">{o.industry}</p>
                  </div>
                </div>
                <p className="small">{o.tagline}</p>
                <div className="row">
                  <Badge tone="primary">{open} open roles</Badge>
                  <Badge>{o.size} people</Badge>
                  {o.verified ? <Badge tone="success">Verified (demo)</Badge> : <Badge tone="warning">Unverified</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
