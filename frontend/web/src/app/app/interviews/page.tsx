'use client';

import Link from 'next/link';
import { useShallow } from 'zustand/react/shallow';
import { formatDateTime } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui/primitives';
import { EnterCityButton } from '@/components/enter-city-button';

export default function CandidateInterviewsPage() {
  const interviews = useDemoStore(useShallow((s) => s.interviews.filter((i) => i.candidateId === s.candidate.id)));
  const jobs = useDemoStore((s) => s.jobs);
  const orgs = useDemoStore((s) => s.organizations);
  const sims = useDemoStore((s) => s.interviewSims);
  const sorted = [...interviews].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return (
    <>
      <PageHeader
        title="Interviews"
        description="Scheduled interviews and practice."
        actions={
          <LinkButton href="/app/missions#interview-sim" variant="primary">
            Practise an interview
          </LinkButton>
        }
      />
      <div className="stack">
        {sorted.length === 0 ? (
          <EmptyState title="No interviews yet">When an employer schedules an interview with you, it appears here.</EmptyState>
        ) : (
          sorted.map((i) => {
            const job = jobs.find((j) => j.id === i.jobId);
            const org = orgs.find((o) => o.id === job?.organizationId);
            return (
              <Card
                key={i.id}
                as="article"
                title={
                  <div>
                    <h2 style={{ fontSize: '1.05rem' }}>
                      <Link href={`/app/jobs/${i.jobId}`}>{job?.title}</Link> · {org?.name}
                    </h2>
                    <p className="small muted">
                      {formatDateTime(i.scheduledAt)} · {i.durationMin} min · {i.format} · with {i.interviewers.join(', ')}
                    </p>
                  </div>
                }
                actions={<Badge tone={i.status === 'scheduled' ? 'warning' : 'default'}>{i.status}</Badge>}
              >
                {i.format === 'virtual-hq' && org ? (
                  <div className="row">
                    <span className="small">This interview takes place at the company&apos;s virtual HQ.</span>
                    <EnterCityButton district={org.district} organizationId={org.id} label="Go to HQ" />
                  </div>
                ) : (
                  <p className="small muted">Joining details are provided by the employer (simulated — no meeting link exists).</p>
                )}
              </Card>
            );
          })
        )}
        <Card title="Practice history">
          {sims.length === 0 ? (
            <p className="muted small">No interview simulations yet.</p>
          ) : (
            <ul className="small" style={{ paddingLeft: 20 }}>
              {sims.map((s, idx) => (
                <li key={idx}>
                  {formatDateTime(s.at)} — {s.role}: self-assessed readiness {s.score}%
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
