'use client';

import { useState } from 'react';
import { formatDateTime, type Interview } from '@grooveli/frontend-domain';
import { useCan } from '@/lib/store/selectors';
import { useOrgInterviews, useOrgJobs } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, MockNotice, PageHeader } from '@/components/ui/primitives';
import { DataTable, Dialog } from '@/components/ui/widgets';
import { TextArea } from '@/components/ui/form';

const CRITERIA = ['Role knowledge', 'Problem solving', 'Communication', 'Values alignment'];

function Interviews() {
  const interviews = useOrgInterviews();
  const jobs = useOrgJobs();
  const canManage = useCan('recruitment.manage');
  const [scoring, setScoring] = useState<Interview | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const update = useAction((id: string, patch: Partial<Interview>) => getService().recruitment.updateInterview(id, patch), { success: 'Interview updated' });
  const sorted = [...interviews].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return (
    <>
      <PageHeader title="Interviews" description="Schedule from the pipeline (🗓️). Record structured scorecards here." />
      <div className="stack">
        <MockNotice title="Simulated scheduling">No calendar invites or meeting links are created.</MockNotice>
        <DataTable
          caption="Interviews"
          rows={sorted}
          rowKey={(i) => i.id}
          empty="No interviews scheduled"
          columns={[
            { key: 'c', header: 'Candidate', render: (i) => i.candidateName, sortValue: (i) => i.candidateName },
            { key: 'j', header: 'Vacancy', render: (i) => jobs.find((j) => j.id === i.jobId)?.title ?? '—' },
            { key: 't', header: 'When', render: (i) => formatDateTime(i.scheduledAt), sortValue: (i) => i.scheduledAt },
            { key: 'f', header: 'Format', render: (i) => i.format },
            { key: 'p', header: 'Panel', render: (i) => i.interviewers.join(', ') },
            { key: 's', header: 'Status', render: (i) => <Badge tone={i.status === 'completed' ? 'success' : i.status === 'cancelled' ? 'default' : 'warning'}>{i.status}</Badge> },
            {
              key: 'x',
              header: '',
              render: (i) =>
                canManage && i.status === 'scheduled' ? (
                  <span className="row">
                    <Button size="sm" variant="primary" onClick={() => { setScoring(i); setScores({}); setNotes(''); }}>
                      Scorecard
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => update.run(i.id, { status: 'cancelled' })}>
                      Cancel
                    </Button>
                  </span>
                ) : i.scorecard.length ? (
                  <span className="small">Avg {(i.scorecard.reduce((a, s) => a + s.score, 0) / i.scorecard.length).toFixed(1)}/5</span>
                ) : null,
            },
          ]}
        />
      </div>
      <Dialog
        open={!!scoring}
        onClose={() => setScoring(null)}
        title={`Scorecard: ${scoring?.candidateName ?? ''}`}
        actions={
          <>
            <Button onClick={() => setScoring(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={Object.keys(scores).length < CRITERIA.length}
              pending={update.pending}
              onClick={async () => {
                if (!scoring) return;
                await update.run(scoring.id, { status: 'completed', notes, scorecard: CRITERIA.map((c) => ({ criterion: c, score: scores[c]! })) });
                setScoring(null);
              }}
            >
              Complete interview
            </Button>
          </>
        }
      >
        {CRITERIA.map((c) => (
          <fieldset key={c} className="field">
            <legend>{c}</legend>
            <div className="chips">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="chip">
                  <input type="radio" name={c} checked={scores[c] === n} onChange={() => setScores((s) => ({ ...s, [c]: n }))} />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <TextArea label="Evidence-based notes" value={notes} onChange={(e) => setNotes(e.target.value)} hint="Record what the candidate said or did — avoid personal impressions." />
      </Dialog>
    </>
  );
}

export default function OrgInterviewsPage() {
  return (
    <OrgGate permission="recruitment.view" module="recruitment">
      <Interviews />
    </OrgGate>
  );
}
