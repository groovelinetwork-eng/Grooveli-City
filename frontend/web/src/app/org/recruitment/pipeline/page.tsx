'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatDateTime, type Application, type ApplicationStatus } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan } from '@/lib/store/selectors';
import { useOrgApplications, useOrgJobs } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { STATUS_TONE } from '@/lib/labels';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, EmptyState, MockNotice, PageHeader } from '@/components/ui/primitives';
import { SelectField } from '@/components/ui/form';
import { Dialog } from '@/components/ui/widgets';
import { ApplicantDetail, ScheduleInterviewDialog } from '@/components/recruitment/recruitment-components';

const COLUMNS: ApplicationStatus[] = ['submitted', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];

function Pipeline() {
  const params = useSearchParams();
  const jobs = useOrgJobs();
  const apps = useOrgApplications();
  const shortlists = useDemoStore((s) => s.shortlists);
  const canManage = useCan('recruitment.manage');
  const [jobId, setJobId] = useState(params.get('job') ?? jobs.find((j) => j.status === 'published')?.id ?? '');
  const [detail, setDetail] = useState<Application | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Application | null>(null);
  const move = useAction((id: string, s: ApplicationStatus) => getService().recruitment.moveApplication(id, s), { success: (r) => (r === undefined ? 'Candidate moved' : null) });
  const toggleList = useAction((sl: string, app: string) => getService().recruitment.toggleShortlist(sl, app));
  const createList = useAction((job: string, ids: string[]) => getService().recruitment.saveShortlist(job, 'Shortlist', ids), { success: 'Shortlist created' });
  const job = jobs.find((j) => j.id === jobId) ?? null;
  const jobApps = useMemo(() => apps.filter((a) => a.jobId === jobId).sort((a, b) => b.fitScore - a.fitScore), [apps, jobId]);
  const jobList = shortlists.find((l) => l.jobId === jobId);

  return (
    <>
      <PageHeader title="Applicant pipeline" description="Applicant tracking board. Move candidates between stages, schedule interviews and shortlist." />
      <div className="stack">
        <MockNotice title="Simulated hiring decisions">
          Stage changes are recorded locally. Candidates are not contacted. Fit scores are a transparent heuristic, not an AI ranking, and never use
          personality data.
        </MockNotice>
        <SelectField
          label="Vacancy"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          options={[{ value: '', label: 'Choose a vacancy' }, ...jobs.map((j) => ({ value: j.id, label: `${j.title} (${apps.filter((a) => a.jobId === j.id).length})` }))]}
        />
        {!job ? (
          <EmptyState title="Choose a vacancy to see its pipeline" />
        ) : (
          <div className="kanban" role="list" aria-label={`Pipeline for ${job.title}`}>
            {COLUMNS.map((col) => {
              const items = jobApps.filter((a) => a.status === col);
              return (
                <section key={col} className="kanban-col" role="listitem" aria-labelledby={`col-${col}`}>
                  <h3 id={`col-${col}`}>
                    <span style={{ textTransform: 'capitalize' }}>{col}</span> <Badge>{items.length}</Badge>
                  </h3>
                  {items.map((a) => {
                    const listed = jobList?.applicationIds.includes(a.id);
                    return (
                      <article key={a.id} className="card" style={{ padding: 10 }}>
                        <div className="row-between">
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0 }} onClick={() => setDetail(a)}>
                            <strong>{a.candidateName}</strong>
                          </button>
                          <Badge tone={a.fitScore >= 75 ? 'success' : a.fitScore >= 55 ? 'primary' : 'default'}>{a.fitScore}%</Badge>
                        </div>
                        <p className="small muted">Applied {formatDateTime(a.submittedAt)}</p>
                        {a.candidateId === 'cand-demo' ? <Badge tone="primary">Demo candidate</Badge> : null}
                        {canManage ? (
                          <div className="row" style={{ marginTop: 6 }}>
                            <label className="sr-only" htmlFor={`mv-${a.id}`}>
                              Move {a.candidateName} to stage
                            </label>
                            <select id={`mv-${a.id}`} className="select" style={{ minHeight: 30, padding: 4, fontSize: '0.8rem' }} value={a.status} onChange={(e) => move.run(a.id, e.target.value as ApplicationStatus)}>
                              {COLUMNS.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            <Button size="sm" onClick={() => setScheduleFor(a)} aria-label={`Schedule interview with ${a.candidateName}`}>
                              🗓️
                            </Button>
                            <Button
                              size="sm"
                              variant={listed ? 'primary' : 'default'}
                              aria-pressed={!!listed}
                              aria-label={`${listed ? 'Remove from' : 'Add to'} shortlist`}
                              onClick={() => (jobList ? toggleList.run(jobList.id, a.id) : createList.run(jobId, [a.id]))}
                            >
                              ⭐
                            </Button>
                          </div>
                        ) : (
                          <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      </div>
      <Dialog open={!!detail} onClose={() => setDetail(null)} title="Applicant">
        {detail && job ? <ApplicantDetail application={detail} job={job} /> : null}
      </Dialog>
      <ScheduleInterviewDialog key={scheduleFor?.id ?? 'none'} open={!!scheduleFor} application={scheduleFor} job={job} onClose={() => setScheduleFor(null)} />
    </>
  );
}

export default function PipelinePage() {
  return (
    <OrgGate permission="recruitment.view" module="recruitment">
      <Suspense fallback={null}>
        <Pipeline />
      </Suspense>
    </OrgGate>
  );
}
