'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { candidateToMatchInput, matchJob } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { welcomeSummary } from '@/lib/assistant/engine';
import { Badge, Button, Card, MockNotice, PageHeader } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/widgets';
import { FitBadge } from '@/components/jobs/job-components';

const SUGGESTIONS = ['Find me a ₦300k+ remote HR role', 'Apply for the best 3', 'What skills should I learn?', 'Help with my CV', 'Draft a cover letter', 'Any deadlines coming up?'];

export default function CareerCenterPage() {
  const state = useDemoStore();
  const thread = state.aiThread;
  const [text, setText] = useState('');
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const send = useAction((t: string) => getService().assistant.send(t));
  const confirm = useAction((ids: string[]) => getService().assistant.confirmApplications(ids), {
    success: (r) => `${r.submitted.length} simulated application(s) recorded`,
  });
  const clear = useAction(() => getService().assistant.clear());
  const input = useMemo(() => candidateToMatchInput(state.candidate), [state.candidate]);
  const applied = useMemo(() => new Set(state.applications.filter((a) => a.candidateId === state.candidate.id).map((a) => a.jobId)), [state.applications, state.candidate.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [thread.length]);

  const submit = async (t: string) => {
    if (!t.trim()) return;
    setText('');
    await send.run(t);
  };

  return (
    <>
      <PageHeader
        title="AI Career Center"
        description="Your career companion for guidance, job discovery, CV help and interview practice."
        badge={<Badge tone="mock">Simulated — rule-based, no AI inference</Badge>}
        actions={
          thread.length ? (
            <Button size="sm" onClick={() => clear.run()}>
              Clear conversation
            </Button>
          ) : null
        }
      />
      <div className="stack">
        <MockNotice title="Simulated assistant">
          Replies come from deterministic rules over your local demo data. Nothing is sent to an AI service, and nothing is submitted without your
          explicit confirmation.
        </MockNotice>
        <Card>
          <div className="chat" ref={listRef} role="log" aria-live="polite" aria-label="Conversation with the Grooveli assistant">
            <div className="bubble bubble-assistant">
              <strong>GROOVELI ASSISTANT</strong>
              {'\n'}
              {welcomeSummary(state)}
            </div>
            {thread.map((m) => (
              <div key={m.id} className={`bubble bubble-${m.role}`}>
                {m.text}
                {m.jobIds?.length ? (
                  <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 8, ['--gap' as string]: '6px' }}>
                    {m.jobIds.map((id) => {
                      const job = state.jobs.find((j) => j.id === id);
                      if (!job) return null;
                      return (
                        <li key={id} className="card" style={{ padding: 10, boxShadow: 'none' }}>
                          <div className="row-between">
                            <Link href={`/app/jobs/${id}`}>{job.title}</Link>
                            <span className="row">
                              <FitBadge match={matchJob(input, job)} />
                              {applied.has(id) ? <Badge tone="success">Applied</Badge> : null}
                            </span>
                          </div>
                          <span className="small muted">{state.organizations.find((o) => o.id === job.organizationId)?.name}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {m.pendingApplicationJobIds?.length ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <Button variant="primary" size="sm" onClick={() => setConfirmIds(m.pendingApplicationJobIds!)}>
                      Review & submit…
                    </Button>
                    <Button size="sm" onClick={() => submit("Don't submit — show me other options")}>
                      Not now
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {send.pending ? (
              <div className="bubble bubble-assistant" aria-label="Assistant is typing">
                …
              </div>
            ) : null}
          </div>
          <form
            className="row"
            style={{ marginTop: 12, flexWrap: 'nowrap' }}
            onSubmit={(e) => {
              e.preventDefault();
              void submit(text);
            }}
          >
            <label htmlFor="ai-input" className="sr-only">
              Message the assistant
            </label>
            <input id="ai-input" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about jobs, skills, your CV…" maxLength={500} />
            <Button type="submit" variant="primary" pending={send.pending}>
              Send
            </Button>
          </form>
          <div className="chips" style={{ marginTop: 10 }} aria-label="Suggested prompts">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="btn btn-sm" onClick={() => submit(s)}>
                {s}
              </button>
            ))}
          </div>
        </Card>
      </div>
      <Dialog
        open={!!confirmIds}
        onClose={() => setConfirmIds(null)}
        title="Confirm applications"
        actions={
          <>
            <Button onClick={() => setConfirmIds(null)}>Cancel</Button>
            <Button
              variant="primary"
              pending={confirm.pending}
              onClick={async () => {
                if (confirmIds) await confirm.run(confirmIds);
                setConfirmIds(null);
              }}
            >
              Submit {confirmIds?.length} (simulated)
            </Button>
          </>
        }
      >
        <p>The assistant prepared these applications. Please confirm you want to submit each one:</p>
        <ul style={{ paddingLeft: 20 }}>
          {confirmIds?.map((id) => {
            const job = state.jobs.find((j) => j.id === id);
            return (
              <li key={id}>
                {job?.title} — {state.organizations.find((o) => o.id === job?.organizationId)?.name}
              </li>
            );
          })}
        </ul>
        <p className="small muted">Submission is simulated: nothing is sent to employers.</p>
      </Dialog>
    </>
  );
}
