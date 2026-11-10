'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { candidateToMatchInput, matchJob, parseDistrict, type Job } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { JobCard, JobFilters, filterJobs, useJobFilters, useOrgLookup } from '@/components/jobs/job-components';
import { Tabs } from '@/components/ui/widgets';

function JobSearch() {
  const params = useSearchParams();
  const { filters, setFilters } = useJobFilters({ district: parseDistrict(params.get('district')) ?? '', sort: 'match' });
  const jobs = useDemoStore((s) => s.jobs);
  const orgs = useDemoStore((s) => s.organizations);
  const candidate = useDemoStore((s) => s.candidate);
  const saved = useDemoStore((s) => s.savedJobIds);
  const applications = useDemoStore((s) => s.applications);
  const orgMap = useOrgLookup(orgs);
  const input = useMemo(() => candidateToMatchInput(candidate), [candidate]);
  const scores = useMemo(() => new Map(jobs.map((j) => [j.id, matchJob(input, j)])), [jobs, input]);
  const appliedIds = useMemo(() => new Set(applications.filter((a) => a.candidateId === candidate.id && a.status !== 'withdrawn').map((a) => a.jobId)), [applications, candidate.id]);
  const results = useMemo(() => filterJobs(jobs, filters, orgs, (j: Job) => scores.get(j.id)?.score ?? 0), [jobs, filters, orgs, scores]);
  const toggle = useAction((id: string) => getService().jobs.toggleSave(id), { success: (r) => (r.saved ? 'Job saved' : 'Removed from saved') });
  const [tab, setTab] = useState<'all' | 'saved'>('all');

  const list = (items: Job[]) =>
    items.length === 0 ? (
      <EmptyState title={tab === 'saved' ? 'No saved jobs yet' : 'No jobs match these filters'}>
        {tab === 'saved' ? 'Use ☆ Save on any job to keep it here.' : 'Try removing a filter.'}
      </EmptyState>
    ) : (
      <div className="grid" style={{ ['--min' as string]: '320px' }}>
        {items.map((j) => (
          <JobCard
            key={j.id}
            job={j}
            org={orgMap.get(j.organizationId)}
            href={`/app/jobs/${j.id}`}
            match={scores.get(j.id)}
            saved={saved.includes(j.id)}
            onToggleSave={() => toggle.run(j.id)}
            applied={appliedIds.has(j.id)}
          />
        ))}
      </div>
    );

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <JobFilters value={filters} onChange={setFilters} showMatchSort />
      <p className="small muted" role="status" aria-live="polite">
        {results.length} matching jobs · {saved.length} saved
      </p>
      <Tabs<'all' | 'saved'>
        label="Job lists"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'all', label: `All results (${results.length})`, content: list(results) },
          { id: 'saved', label: `Saved (${saved.length})`, content: list(jobs.filter((j) => saved.includes(j.id))) },
        ]}
      />
    </div>
  );
}

export default function CandidateJobsPage() {
  return (
    <>
      <PageHeader title="Find jobs" description="Search, filter and save. Fit scores explain matching skills and gaps — they are a transparent heuristic, not AI." />
      <Suspense fallback={null}>
        <JobSearch />
      </Suspense>
    </>
  );
}
