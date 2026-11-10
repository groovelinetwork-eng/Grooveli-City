'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseDistrict } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { JobCard, JobFilters, filterJobs, useJobFilters, useOrgLookup } from '@/components/jobs/job-components';

function Listing() {
  const params = useSearchParams();
  const district = parseDistrict(params.get('district'));
  const { filters, setFilters } = useJobFilters({ district: district ?? '' });
  const jobs = useDemoStore((s) => s.jobs);
  const orgs = useDemoStore((s) => s.organizations);
  const orgMap = useOrgLookup(orgs);
  const results = useMemo(() => filterJobs(jobs, filters, orgs), [jobs, filters, orgs]);
  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <JobFilters value={filters} onChange={setFilters} />
      <p className="small muted" role="status" aria-live="polite">
        {results.length} {results.length === 1 ? 'opportunity' : 'opportunities'}
      </p>
      {results.length === 0 ? (
        <EmptyState title="No jobs match these filters">Try removing a filter or broadening your keywords.</EmptyState>
      ) : (
        <div className="grid" style={{ ['--min' as string]: '320px' }}>
          {results.map((j) => (
            <JobCard key={j.id} job={j} org={orgMap.get(j.organizationId)} href={`/opportunities/${j.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <div className="container section">
      <PageHeader
        title="Opportunities"
        description="The same jobs you can discover in the city — searchable without it. All listings are synthetic."
      />
      <Suspense fallback={null}>
        <Listing />
      </Suspense>
    </div>
  );
}
