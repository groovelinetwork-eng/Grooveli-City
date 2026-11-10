'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDateTime } from '@grooveli/frontend-domain';
import { STATUS_TONE, PIPELINE_STAGES as PIPELINE } from '@/lib/labels';
import { useDemoStore } from '@/lib/store/store';
import { candidateApplications } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, EmptyState, LinkButton, MockNotice, PageHeader } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/widgets';


export default function ApplicationsPage() {
  const state = useDemoStore();
  const apps = useMemo(() => candidateApplications(state).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), [state]);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const withdraw = useAction((id: string) => getService().jobs.withdraw(id), { success: 'Application withdrawn' });

  return (
    <>
      <PageHeader title="Applications" description="Track every application from submission to offer." badge={<Badge tone="mock">Simulated employer updates</Badge>} />
      <div className="stack">
        <MockNotice title="Simulated">Applications are stored locally. Status changes come from demo employer personas in this browser, not real employers.</MockNotice>
        {apps.length === 0 ? (
          <EmptyState title="No applications yet" action={<LinkButton href="/app/jobs" variant="primary">Find jobs</LinkButton>}>
            When you apply, you&apos;ll track progress here.
          </EmptyState>
        ) : (
          apps.map((a) => {
            const job = state.jobs.find((j) => j.id === a.jobId);
            const org = state.organizations.find((o) => o.id === job?.organizationId);
            const stageIndex = PIPELINE.indexOf(a.status);
            return (
              <Card
                key={a.id}
                as="article"
                title={
                  <div>
                    <h2 style={{ fontSize: '1.05rem' }}>
                      <Link href={`/app/jobs/${a.jobId}`}>{job?.title ?? a.jobId}</Link>
                    </h2>
                    <p className="small muted">
                      {org?.name} · applied {formatDateTime(a.submittedAt)} · fit {a.fitScore}%
                    </p>
                  </div>
                }
                actions={
                  <>
                    <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                    {!['withdrawn', 'rejected', 'hired'].includes(a.status) ? (
                      <Button size="sm" variant="danger" onClick={() => setWithdrawId(a.id)}>
                        Withdraw
                      </Button>
                    ) : null}
                  </>
                }
              >
                {stageIndex >= 0 ? (
                  <ol className="steps" aria-label="Application progress">
                    {PIPELINE.map((s, i) => (
                      <li key={s} aria-current={i === stageIndex ? 'step' : undefined} data-done={i < stageIndex}>
                        {i < stageIndex ? '✓ ' : ''}
                        {s}
                      </li>
                    ))}
                  </ol>
                ) : null}
                <details>
                  <summary className="small" style={{ cursor: 'pointer' }}>
                    History ({a.history.length})
                  </summary>
                  <ul className="small" style={{ paddingLeft: 20, marginTop: 6 }}>
                    {a.history.map((h, i) => (
                      <li key={i}>
                        {formatDateTime(h.at)} — {h.status}
                        {h.note ? ` (${h.note})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>
            );
          })
        )}
      </div>
      <Dialog
        open={!!withdrawId}
        onClose={() => setWithdrawId(null)}
        title="Withdraw application?"
        actions={
          <>
            <Button onClick={() => setWithdrawId(null)}>Keep application</Button>
            <Button
              variant="danger"
              pending={withdraw.pending}
              onClick={async () => {
                if (withdrawId) await withdraw.run(withdrawId);
                setWithdrawId(null);
              }}
            >
              Withdraw
            </Button>
          </>
        }
      >
        <p>The employer will see that you withdrew. You can apply again later if the role is still open.</p>
      </Dialog>
    </>
  );
}
