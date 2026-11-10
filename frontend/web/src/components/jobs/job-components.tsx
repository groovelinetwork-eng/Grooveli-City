'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  DISTRICTS,
  formatDate,
  formatNaira,
  type DistrictId,
  type EmploymentType,
  type ExperienceLevel,
  type Job,
  type MatchResult,
  type OrganizationPublicProfile,
  type WorkMode,
} from '@grooveli/frontend-domain';
import { Badge, Button } from '@/components/ui/primitives';
import { OrgLogo } from '@/components/ui/avatar';
import { SelectField, TextField } from '@/components/ui/form';

export interface JobFilterState {
  q: string;
  district: DistrictId | '';
  workMode: WorkMode | '';
  type: EmploymentType | '';
  level: ExperienceLevel | '';
  minSalary: number;
  sort: 'recent' | 'salary' | 'match';
}

export const EMPTY_FILTERS: JobFilterState = { q: '', district: '', workMode: '', type: '', level: '', minSalary: 0, sort: 'recent' };

export function filterJobs(jobs: Job[], f: JobFilterState, orgs: OrganizationPublicProfile[], score?: (j: Job) => number): Job[] {
  const q = f.q.trim().toLowerCase();
  const orgName = new Map(orgs.map((o) => [o.id, o.name.toLowerCase()]));
  const out = jobs.filter(
    (j) =>
      j.status === 'published' &&
      (!q || j.title.toLowerCase().includes(q) || j.skills.some((s) => s.toLowerCase().includes(q)) || (orgName.get(j.organizationId) ?? '').includes(q)) &&
      (!f.district || j.district === f.district) &&
      (!f.workMode || j.workMode === f.workMode) &&
      (!f.type || j.employmentType === f.type) &&
      (!f.level || j.level === f.level) &&
      j.salaryMax >= f.minSalary,
  );
  if (f.sort === 'salary') out.sort((a, b) => b.salaryMax - a.salaryMax);
  else if (f.sort === 'match' && score) out.sort((a, b) => score(b) - score(a));
  else out.sort((a, b) => b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id));
  return out;
}

export function JobFilters({ value, onChange, showMatchSort }: { value: JobFilterState; onChange: (f: JobFilterState) => void; showMatchSort?: boolean }) {
  const set = <K extends keyof JobFilterState>(k: K, v: JobFilterState[K]) => onChange({ ...value, [k]: v });
  return (
    <form className="card" role="search" aria-label="Filter jobs" onSubmit={(e) => e.preventDefault()}>
      <div className="grid" style={{ ['--min' as string]: '160px' }}>
        <TextField label="Keywords" placeholder="Title, skill or company" value={value.q} onChange={(e) => set('q', e.target.value)} />
        <SelectField
          label="District"
          value={value.district}
          onChange={(e) => set('district', e.target.value as DistrictId | '')}
          options={[{ value: '', label: 'All districts' }, ...DISTRICTS.filter((d) => d.industries.length).map((d) => ({ value: d.id, label: d.name }))]}
        />
        <SelectField
          label="Work arrangement"
          value={value.workMode}
          onChange={(e) => set('workMode', e.target.value as WorkMode | '')}
          options={[
            { value: '', label: 'Any' },
            { value: 'remote', label: 'Remote' },
            { value: 'hybrid', label: 'Hybrid' },
            { value: 'onsite', label: 'Onsite' },
          ]}
        />
        <SelectField
          label="Employment type"
          value={value.type}
          onChange={(e) => set('type', e.target.value as EmploymentType | '')}
          options={[
            { value: '', label: 'Any' },
            { value: 'full-time', label: 'Full-time' },
            { value: 'part-time', label: 'Part-time' },
            { value: 'contract', label: 'Contract' },
            { value: 'internship', label: 'Internship' },
            { value: 'freelance', label: 'Freelance' },
          ]}
        />
        <SelectField
          label="Experience"
          value={value.level}
          onChange={(e) => set('level', e.target.value as ExperienceLevel | '')}
          options={[
            { value: '', label: 'Any' },
            { value: 'entry', label: 'Entry' },
            { value: 'mid', label: 'Mid' },
            { value: 'senior', label: 'Senior' },
            { value: 'lead', label: 'Lead' },
          ]}
        />
        <SelectField
          label="Minimum monthly salary"
          value={String(value.minSalary)}
          onChange={(e) => set('minSalary', Number(e.target.value))}
          options={[0, 200_000, 300_000, 500_000, 800_000, 1_000_000].map((n) => ({ value: String(n), label: n ? `${formatNaira(n, { compact: true })}+` : 'Any' }))}
        />
        <SelectField
          label="Sort by"
          value={value.sort}
          onChange={(e) => set('sort', e.target.value as JobFilterState['sort'])}
          options={[
            { value: 'recent', label: 'Most recent' },
            { value: 'salary', label: 'Highest salary' },
            ...(showMatchSort ? [{ value: 'match', label: 'Best fit for me' }] : []),
          ]}
        />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear filters
        </Button>
      </div>
    </form>
  );
}

export { salaryRange } from '@/lib/job-format';
import { salaryRange } from '@/lib/job-format';

export function FitBadge({ match }: { match: MatchResult }) {
  const tone = match.band === 'excellent' ? 'success' : match.band === 'good' ? 'primary' : match.band === 'fair' ? 'warning' : 'default';
  return (
    <Badge tone={tone} title="Rule-based fit heuristic (skills + hard constraints). Not AI. Personality is never used.">
      {match.score}% fit
    </Badge>
  );
}

export function JobCard({
  job,
  org,
  href,
  match,
  saved,
  onToggleSave,
  applied,
}: {
  job: Job;
  org?: OrganizationPublicProfile;
  href: string;
  match?: MatchResult | null;
  saved?: boolean;
  onToggleSave?: () => void;
  applied?: boolean;
}) {
  return (
    <article className="card" aria-labelledby={`job-${job.id}`}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', minWidth: 0 }}>
          {org ? <OrgLogo glyph={org.logoGlyph} color={org.logoColor} name={org.name} /> : null}
          <div style={{ minWidth: 0 }}>
            <h3 id={`job-${job.id}`}>
              <Link href={href}>{job.title}</Link>
            </h3>
            <p className="small muted">
              {org?.name ?? job.organizationId} · {job.location}
            </p>
          </div>
        </div>
        {onToggleSave ? (
          <Button size="sm" variant="ghost" onClick={onToggleSave} aria-pressed={saved} aria-label={saved ? `Unsave ${job.title}` : `Save ${job.title}`}>
            {saved ? '★ Saved' : '☆ Save'}
          </Button>
        ) : null}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <Badge>{job.workMode}</Badge>
        <Badge>{job.employmentType}</Badge>
        <Badge>{job.level}</Badge>
        <Badge tone="primary">{salaryRange(job)}</Badge>
        {match ? <FitBadge match={match} /> : null}
        {applied ? <Badge tone="success">Applied</Badge> : null}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        {job.skills.join(' · ')} · Posted {formatDate(job.postedOn)}
      </p>
    </article>
  );
}

export function useJobFilters(initial?: Partial<JobFilterState>) {
  const [filters, setFilters] = useState<JobFilterState>({ ...EMPTY_FILTERS, ...initial });
  return { filters, setFilters };
}

export function useOrgLookup(orgs: OrganizationPublicProfile[]) {
  return useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
}
