'use client';

import Link from 'next/link';
import { Suspense, use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SUITABLE_MATCH_THRESHOLD, formatDate } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useJobMatch } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, EmptyState, InfoNotice, LinkButton, MockNotice } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/widgets';
import { TextArea } from '@/components/ui/form';
import { OrgLogo } from '@/components/ui/avatar';
import { FitBadge, salaryRange } from '@/components/jobs/job-components';
import { EnterCityButton } from '@/components/enter-city-button';

function JobDetail({ jobId }: { jobId: string }) {
  const params = useSearchParams();
  const job = useDemoStore((s) => s.jobs.find((j) => j.id === jobId));
  const org = useDemoStore((s) => s.organizations.find((o) => o.id === job?.organizationId));
  const candidate = useDemoStore((s) => s.candidate);
  const existing = useDemoStore((s) => s.applications.find((a) => a.jobId === jobId && a.candidateId === s.candidate.id && a.status !== 'withdrawn'));
  const saved = useDemoStore((s) => s.savedJobIds.includes(jobId));
  const match = useJobMatch(job);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'compose' | 'confirm'>('compose');
  const [letter, setLetter] = useState('');
  const apply = useAction((cover: string) => getService().jobs.apply(jobId, { coverLetter: cover }), {
    success: (r) => `Application recorded (simulated). ${r.xp.award ? `+${r.xp.award} XP` : r.xp.reason}`,
  });
  const toggle = useAction(() => getService().jobs.toggleSave(jobId));

  useEffect(() => {
    if (params.get('apply') === '1' && job && !existing) setOpen(true);
  }, [params, job, existing]);

  useEffect(() => {
    if (open && !letter && job && org) {
      setLetter(
        `Dear ${org.name} hiring team,\n\nI'd like to apply for the ${job.title} role. I bring ${candidate.yearsExperience} years of experience and strengths in ${candidate.skills
          .slice(0, 3)
          .map((s) => s.name)
          .join(', ')}.\n\nKind regards,\n${candidate.displayName}`,
      );
    }
  }, [open, letter, job, org, candidate]);

  if (!job) return <EmptyState title="Job not found" action={<LinkButton href="/app/jobs">Back to jobs</LinkButton>} />;

  return (
    <div className="stack" style={{ ['--gap' as string]: '20px' }}>
      <nav aria-label="Breadcrumb" className="small">
        <Link href="/app/jobs">Find jobs</Link> / {job.title}
      </nav>
      <header className="row-between">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {org ? <OrgLogo glyph={org.logoGlyph} color={org.logoColor} name={org.name} size={56} /> : null}
          <div>
            <h1>{job.title}</h1>
            <p className="muted">
              {org ? <Link href={`/companies/${org.id}`}>{org.name}</Link> : null} · {job.location}
            </p>
            <div className="row" style={{ marginTop: 6 }}>
              <Badge>{job.workMode}</Badge>
              <Badge>{job.employmentType}</Badge>
              <Badge tone="primary">{salaryRange(job)}</Badge>
              {match ? <FitBadge match={match} /> : null}
              {job.status !== 'published' ? <Badge tone="warning">{job.status}</Badge> : null}
            </div>
          </div>
        </div>
        <div className="row">
          <Button onClick={() => toggle.run()} aria-pressed={saved}>
            {saved ? '★ Saved' : '☆ Save'}
          </Button>
          {existing ? (
            <LinkButton href="/app/applications" variant="primary">
              Applied · {existing.status}
            </LinkButton>
          ) : (
            <Button variant="primary" onClick={() => setOpen(true)} disabled={job.status !== 'published'}>
              Apply
            </Button>
          )}
          <EnterCityButton district={job.district} organizationId={job.organizationId} label="Visit HQ" />
        </div>
      </header>

      {match ? (
        <Card title="Your fit, explained" actions={<Badge tone="mock">Rule-based heuristic</Badge>}>
          <div className="grid-2">
            <div>
              <h3>Why you match</h3>
              <ul style={{ paddingLeft: 20 }}>
                {match.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Potential gaps</h3>
              {match.gaps.length ? (
                <ul style={{ paddingLeft: 20 }}>
                  {match.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No gaps found.</p>
              )}
              {match.missingSkills.length ? (
                <p className="small" style={{ marginTop: 8 }}>
                  Close gaps through <Link href="/app/learning">learning paths</Link> or <Link href="/app/missions">skill missions</Link>.
                </p>
              ) : null}
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Hard constraints: {match.constraints.map((c) => `${c.label} ${c.passed ? '✓' : '✗'}`).join(' · ')}. Personality preferences are never used.
          </p>
        </Card>
      ) : null}

      <div className="grid-2">
        <Card title="About the role">
          <p>{job.description}</p>
          <ul style={{ paddingLeft: 20, marginTop: 12 }}>
            {job.responsibilities.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
        <Card title="Details">
          <dl className="stack" style={{ ['--gap' as string]: '6px' }}>
            <dt className="small muted">Skills</dt>
            <dd className="row">{job.skills.map((s) => <Badge key={s}>{s}</Badge>)}</dd>
            <dt className="small muted">Experience</dt>
            <dd>{job.minYears}+ years</dd>
            <dt className="small muted">Qualifications</dt>
            <dd>{job.requiredQualifications.join(', ') || 'None mandatory'}</dd>
            <dt className="small muted">Closes</dt>
            <dd>{formatDate(job.closesOn)}</dd>
          </dl>
        </Card>
      </div>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setStep('compose');
        }}
        title={step === 'compose' ? `Apply: ${job.title}` : 'Confirm submission'}
        actions={
          step === 'compose' ? (
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setStep('confirm')} disabled={letter.trim().length < 20}>
                Review
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setStep('compose')}>Back</Button>
              <Button
                variant="primary"
                pending={apply.pending}
                onClick={async () => {
                  const r = await apply.run(letter);
                  if (r) {
                    setOpen(false);
                    setStep('compose');
                  }
                }}
              >
                Confirm & submit (simulated)
              </Button>
            </>
          )
        }
      >
        {step === 'compose' ? (
          <div className="stack">
            <MockNotice title="Simulated application">Your application is recorded locally. No employer receives it.</MockNotice>
            <TextArea label="Cover note" value={letter} onChange={(e) => setLetter(e.target.value)} rows={8} hint="At least 20 characters." />
            {match && match.score < SUITABLE_MATCH_THRESHOLD ? (
              <InfoNotice>
                This role is a {match.band} fit ({match.score}%). You can still apply, but it won&apos;t earn XP — Grooveli rewards suitable applications, not
                volume.
              </InfoNotice>
            ) : null}
          </div>
        ) : (
          <div className="stack">
            <p>
              You&apos;re about to submit an application to <strong>{org?.name}</strong> for <strong>{job.title}</strong> with your current profile
              {candidate.cvFile ? ` and CV (${candidate.cvFile.name})` : ''}.
            </p>
            <p className="small muted">This is a consequential action, so we always ask you to confirm. In this demo nothing leaves your browser.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function CandidateJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  return (
    <Suspense fallback={null}>
      <JobDetail jobId={jobId} />
    </Suspense>
  );
}
