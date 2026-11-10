'use client';

import Link from 'next/link';
import { useDemoStore } from '@/lib/store/store';
import { useCan } from '@/lib/store/selectors';
import { useOrgApplications, useOrgJobs } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { STATUS_TONE } from '@/lib/labels';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives';

function Shortlists() {
  const jobs = useOrgJobs();
  const apps = useOrgApplications();
  const shortlists = useDemoStore((s) => s.shortlists);
  const canManage = useCan('recruitment.manage');
  const toggle = useAction((sl: string, app: string) => getService().recruitment.toggleShortlist(sl, app), { success: 'Shortlist updated' });
  const jobIds = new Set(jobs.map((j) => j.id));
  const mine = shortlists.filter((l) => jobIds.has(l.jobId));
  return (
    <>
      <PageHeader title="Shortlists" description="Candidates you've starred for each vacancy. Add candidates from the pipeline with ⭐." />
      {mine.length === 0 ? (
        <EmptyState title="No shortlists yet" action={<Link href="/org/recruitment/pipeline">Open the pipeline</Link>} />
      ) : (
        <div className="grid" style={{ ['--min' as string]: '320px' }}>
          {mine.map((l) => {
            const job = jobs.find((j) => j.id === l.jobId);
            const members = apps.filter((a) => l.applicationIds.includes(a.id)).sort((a, b) => b.fitScore - a.fitScore);
            return (
              <Card key={l.id} title={<h2 style={{ fontSize: '1rem' }}>{l.name}</h2>} actions={<Badge>{job?.title}</Badge>}>
                {members.length === 0 ? (
                  <p className="small muted">Empty shortlist.</p>
                ) : (
                  <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
                    {members.map((a) => (
                      <li key={a.id} className="row-between">
                        <span>
                          {a.candidateName} <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                        </span>
                        <span className="row">
                          <Badge tone="primary">{a.fitScore}%</Badge>
                          {canManage ? (
                            <Button size="sm" variant="ghost" onClick={() => toggle.run(l.id, a.id)} aria-label={`Remove ${a.candidateName}`}>
                              ✕
                            </Button>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="small" style={{ marginTop: 8 }}>
                  <Link href={`/org/recruitment/pipeline?job=${l.jobId}`}>Open pipeline →</Link>
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function ShortlistsPage() {
  return (
    <OrgGate permission="recruitment.view" module="recruitment">
      <Shortlists />
    </OrgGate>
  );
}
