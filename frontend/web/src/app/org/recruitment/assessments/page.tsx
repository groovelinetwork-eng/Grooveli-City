'use client';

import { useState } from 'react';
import { useDemoStore } from '@/lib/store/store';
import { useCan, usePersona } from '@/lib/store/selectors';
import { useOrgApplications, useOrgJobs } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { SelectField, TextArea, TextField } from '@/components/ui/form';

function Assessments() {
  const jobs = useOrgJobs();
  const apps = useOrgApplications();
  const assessments = useDemoStore((s) => s.assessments);
  const persona = usePersona();
  const canManage = useCan('recruitment.manage');
  const [form, setForm] = useState({ jobId: jobs[0]?.id ?? '', title: '', kind: 'skills-test' as 'skills-test' | 'case-study' | 'work-sample', questions: '' });
  const [score, setScore] = useState<Record<string, string>>({});
  const create = useAction(() => getService().recruitment.createAssessment(form.jobId, form.title, form.kind, form.questions.split('\n').map((q) => q.trim())), { success: 'Assessment created' });
  const record = useAction((asm: string, app: string, s: number) => getService().recruitment.recordAssessment(asm, app, s, persona?.displayName ?? 'Reviewer'), { success: 'Score recorded' });
  const jobIds = new Set(jobs.map((j) => j.id));
  const mine = assessments.filter((a) => jobIds.has(a.jobId));
  return (
    <>
      <PageHeader title="Assessments" description="Structured assessments keep evaluation consistent across candidates." />
      <div className="stack">
        {mine.length === 0 ? <EmptyState title="No assessments yet" /> : null}
        {mine.map((a) => {
          const job = jobs.find((j) => j.id === a.jobId);
          const candidates = apps.filter((x) => x.jobId === a.jobId && ['shortlisted', 'interview', 'offer', 'screening'].includes(x.status));
          return (
            <Card key={a.id} title={<h2 style={{ fontSize: '1rem' }}>{a.title}</h2>} actions={<><Badge>{a.kind}</Badge><Badge tone="primary">{job?.title}</Badge></>}>
              <ol className="small" style={{ paddingLeft: 20 }}>
                {a.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
              <h3 style={{ marginTop: 12 }}>Results</h3>
              {candidates.length === 0 ? (
                <p className="small muted">No candidates at assessment stages.</p>
              ) : (
                <ul className="stack" style={{ listStyle: 'none', padding: 0, ['--gap' as string]: '6px' }}>
                  {candidates.map((c) => {
                    const r = a.results.find((x) => x.applicationId === c.id);
                    const key = `${a.id}:${c.id}`;
                    return (
                      <li key={c.id} className="row-between">
                        <span>{c.candidateName}</span>
                        <span className="row">
                          {r ? <Badge tone={r.score >= 70 ? 'success' : 'warning'}>{r.score}/100 · {r.reviewer}</Badge> : <Badge>Not scored</Badge>}
                          {canManage ? (
                            <>
                              <label className="sr-only" htmlFor={key}>Score for {c.candidateName}</label>
                              <input id={key} className="input" type="number" min={0} max={100} style={{ width: 80, minHeight: 32 }} value={score[key] ?? ''} onChange={(e) => setScore((s) => ({ ...s, [key]: e.target.value }))} />
                              <Button size="sm" disabled={!score[key]} onClick={() => record.run(a.id, c.id, Number(score[key]))}>
                                Save
                              </Button>
                            </>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
        {canManage ? (
          <Card title="Create assessment">
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await create.run()) setForm((f) => ({ ...f, title: '', questions: '' }));
              }}
            >
              <div className="grid-2">
                <SelectField label="Vacancy" value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} options={jobs.map((j) => ({ value: j.id, label: j.title }))} />
                <SelectField
                  label="Type"
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}
                  options={[
                    { value: 'skills-test', label: 'Skills test' },
                    { value: 'case-study', label: 'Case study' },
                    { value: 'work-sample', label: 'Work sample' },
                  ]}
                />
              </div>
              <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <TextArea label="Questions (one per line)" value={form.questions} onChange={(e) => setForm({ ...form, questions: e.target.value })} />
              <div>
                <Button type="submit" variant="primary" pending={create.pending}>Create</Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}

export default function AssessmentsPage() {
  return (
    <OrgGate permission="recruitment.view" module="recruitment">
      <Assessments />
    </OrgGate>
  );
}
