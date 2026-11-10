'use client';

import { useMemo, useState } from 'react';
import { TALENT_POOL, formatNaira, matchJob, talentToMatchInput } from '@grooveli/frontend-domain';
import { useOrgApplications, useOrgJobs } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, MockNotice, PageHeader } from '@/components/ui/primitives';
import { Checkbox, SelectField } from '@/components/ui/form';
import { MatchExplanation } from '@/components/recruitment/recruitment-components';

function Sourcing() {
  const jobs = useOrgJobs().filter((j) => j.status === 'published');
  const apps = useOrgApplications();
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '');
  const [hardOnly, setHardOnly] = useState(false);
  const invite = useAction((talentId: string) => getService().recruitment.inviteTalent(talentId, jobId), { success: 'Added to pipeline as Screening (simulated outreach)' });
  const job = jobs.find((j) => j.id === jobId);
  const ranked = useMemo(() => {
    if (!job) return [];
    return TALENT_POOL.map((t) => ({ t, m: matchJob(talentToMatchInput(t), job) }))
      .filter((r) => !hardOnly || r.m.constraints.every((c) => c.passed))
      .sort((a, b) => b.m.score - a.m.score)
      .slice(0, 12);
  }, [job, hardOnly]);
  const inPipeline = new Set(apps.filter((a) => a.jobId === jobId).map((a) => a.candidateId));
  const strong = ranked.filter((r) => r.m.score >= 65).length;

  return (
    <>
      <PageHeader title="Candidate sourcing & matching" description="Discover candidates from the talent pool and see why they match." badge={<Badge tone="mock">Simulated recruiter assistant</Badge>} />
      <div className="stack">
        <MockNotice title="Synthetic talent pool">
          These candidates are fictional. Ranking is a transparent skills + hard-constraint heuristic — not AI — and never uses personality, gender or
          avatar data. Inviting does not contact anyone.
        </MockNotice>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <SelectField label="Vacancy" value={jobId} onChange={(e) => setJobId(e.target.value)} options={jobs.map((j) => ({ value: j.id, label: j.title }))} />
          <Checkbox label="Only candidates passing all hard constraints" checked={hardOnly} onChange={(e) => setHardOnly(e.target.checked)} />
        </div>
        {job ? (
          <Card>
            <p role="status">
              <strong>Recruiter assistant:</strong> I found {ranked.length} candidates for your {job.title} position and ranked them against your
              requirements. {strong} look like strong matches.
            </p>
          </Card>
        ) : null}
        {!job ? (
          <EmptyState title="Publish a vacancy to start sourcing" />
        ) : ranked.length === 0 ? (
          <EmptyState title="No candidates pass every hard constraint">Untick the filter to see near matches and their gaps.</EmptyState>
        ) : (
          <div className="grid" style={{ ['--min' as string]: '320px' }}>
            {ranked.map(({ t }) => (
              <Card key={t.id} as="article" title={<div><h2 style={{ fontSize: '1rem' }}>{t.name}</h2><p className="small muted">{t.headline} · {t.location}</p></div>}>
                <p className="small muted">
                  Expects {formatNaira(t.expectedSalary, { compact: true })}/mo · {t.workModes.join('/')} · {t.employmentTypes.join('/')}
                </p>
                <MatchExplanation input={talentToMatchInput(t)} job={job} />
                <div style={{ marginTop: 8 }}>
                  {inPipeline.has(t.id) ? (
                    <Badge tone="success">In pipeline</Badge>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => invite.run(t.id)} pending={invite.pending}>
                      Add to pipeline
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function SourcingPage() {
  return (
    <OrgGate permission="recruitment.manage" module="recruitment">
      <Sourcing />
    </OrgGate>
  );
}
