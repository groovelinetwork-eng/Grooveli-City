'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DEMO_TODAY, addDays, formatDate, type EngagementSurvey, type SurveyQuestion } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan } from '@/lib/store/selectors';
import { useOrgId } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, InfoNotice, PageHeader } from '@/components/ui/primitives';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { BarChart, Dialog } from '@/components/ui/widgets';

function TakeSurvey({ survey, onDone }: { survey: EngagementSurvey; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const submit = useAction(() => getService().engagement.respondToSurvey(survey.id, answers), { success: 'Thanks — response recorded' });
  const complete = survey.questions.filter((q) => q.kind === 'scale').every((q) => typeof answers[q.id] === 'number');
  return (
    <div className="stack">
      {survey.anonymous ? <InfoNotice>Marked anonymous. In demo mode, responses are stored in this browser without your name.</InfoNotice> : null}
      {survey.questions.map((q) =>
        q.kind === 'scale' ? (
          <fieldset key={q.id} className="field">
            <legend>{q.text}</legend>
            <div className="chips">
              {Array.from({ length: 11 }, (_, n) => (
                <label key={n} className="chip">
                  <input type="radio" name={q.id} checked={answers[q.id] === n} onChange={() => setAnswers((a) => ({ ...a, [q.id]: n }))} />
                  <span style={{ minWidth: 36, justifyContent: 'center' }}>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <TextArea key={q.id} label={q.text} value={(answers[q.id] as string) ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
        ),
      )}
      <div>
        <Button
          variant="primary"
          disabled={!complete}
          pending={submit.pending}
          onClick={async () => {
            if (await submit.run()) onDone();
          }}
        >
          Submit response
        </Button>
      </div>
    </div>
  );
}

function Results({ survey }: { survey: EngagementSurvey }) {
  return (
    <div className="stack">
      {survey.questions.map((q) => {
        if (q.kind === 'text') {
          const texts = survey.responses.map((r) => r.answers[q.id]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
          return (
            <div key={q.id}>
              <h3>{q.text}</h3>
              <ul className="small" style={{ paddingLeft: 20 }}>
                {texts.length ? texts.slice(0, 10).map((t, i) => <li key={i}>{t}</li>) : <li className="muted">No comments</li>}
              </ul>
            </div>
          );
        }
        const vals = survey.responses.map((r) => r.answers[q.id]).filter((v): v is number => typeof v === 'number');
        const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
        const promoters = vals.filter((v) => v >= 9).length;
        const detractors = vals.filter((v) => v <= 6).length;
        const nps = vals.length ? Math.round(((promoters - detractors) / vals.length) * 100) : null;
        return (
          <div key={q.id}>
            <h3>{q.text}</h3>
            <p className="small muted">
              Average {avg} · {vals.length} responses{nps !== null ? ` · NPS-style score ${nps}` : ''}
            </p>
            <BarChart title={q.text} data={Array.from({ length: 11 }, (_, n) => ({ label: String(n), value: vals.filter((v) => v === n).length }))} />
          </div>
        );
      })}
    </div>
  );
}

function Surveys() {
  const orgId = useOrgId()!;
  const surveys = useDemoStore(useShallow((s) => s.surveys.filter((x) => x.organizationId === orgId)));
  const canManage = useCan('engagement.manage');
  const [taking, setTaking] = useState<EngagementSurvey | null>(null);
  const [viewing, setViewing] = useState<EngagementSurvey | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', anonymous: true, questions: 'How satisfied are you with your work this month? (0–10)\nWhat should we improve?', closesOn: addDays(DEMO_TODAY, 14) });
  const save = useAction((s: Omit<EngagementSurvey, 'responses'>) => getService().engagement.saveSurvey(s), { success: 'Survey saved' });
  const toQuestions = (text: string): SurveyQuestion[] =>
    text.split('\n').map((t) => t.trim()).filter(Boolean).map((t, i) => ({ id: `q${i + 1}`, text: t, kind: /0\s*[–-]\s*10/.test(t) ? 'scale' : 'text' }));
  return (
    <>
      <PageHeader title="Engagement surveys" description="Pulse and engagement surveys with aggregated results." actions={canManage ? <Button variant="primary" onClick={() => setCreating(true)}>New survey</Button> : null} />
      {surveys.length === 0 ? (
        <EmptyState title="No surveys" />
      ) : (
        <div className="grid" style={{ ['--min' as string]: '300px' }}>
          {surveys.map((s) => (
            <Card key={s.id} as="article" title={<h2 style={{ fontSize: '1.05rem' }}>{s.title}</h2>} actions={<Badge tone={s.status === 'open' ? 'success' : 'default'}>{s.status}</Badge>}>
              <p className="small muted">
                {s.questions.length} questions · {s.responses.length} responses · closes {formatDate(s.closesOn)} {s.anonymous ? '· anonymous' : ''}
              </p>
              <div className="row" style={{ marginTop: 8 }}>
                {s.status === 'open' ? (
                  <Button size="sm" variant="primary" onClick={() => setTaking(s)}>
                    Take survey
                  </Button>
                ) : null}
                {canManage ? (
                  <>
                    <Button size="sm" onClick={() => setViewing(s)}>
                      Results
                    </Button>
                    {s.status !== 'closed' ? (
                      <Button size="sm" variant="ghost" onClick={() => save.run({ ...s, status: s.status === 'draft' ? 'open' : 'closed' })}>
                        {s.status === 'draft' ? 'Open' : 'Close'}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!taking} onClose={() => setTaking(null)} title={taking?.title ?? ''}>
        {taking ? <TakeSurvey survey={taking} onDone={() => setTaking(null)} /> : null}
      </Dialog>
      <Dialog open={!!viewing} onClose={() => setViewing(null)} title={`Results: ${viewing?.title ?? ''}`}>
        {viewing ? <Results survey={surveys.find((s) => s.id === viewing.id) ?? viewing} /> : null}
      </Dialog>
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New survey"
        actions={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              pending={save.pending}
              onClick={async () => {
                const ok = await save.run({ id: `svy-${Date.now().toString(36)}`, organizationId: orgId, title: draft.title, status: 'open', anonymous: draft.anonymous, questions: toQuestions(draft.questions), closesOn: draft.closesOn });
                if (ok) setCreating(false);
              }}
            >
              Create & open
            </Button>
          </>
        }
      >
        <TextField label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <TextArea label="Questions (one per line; include “0–10” for a rating question)" value={draft.questions} onChange={(e) => setDraft({ ...draft, questions: e.target.value })} rows={5} />
        <TextField label="Closes on" type="date" value={draft.closesOn} onChange={(e) => setDraft({ ...draft, closesOn: e.target.value })} />
        <Checkbox label="Anonymous" checked={draft.anonymous} onChange={(e) => setDraft({ ...draft, anonymous: e.target.checked })} />
        <SelectField label="Preview of detected question types" value="" onChange={() => undefined} options={[{ value: '', label: toQuestions(draft.questions).map((q) => q.kind).join(', ') || '—' }]} disabled />
      </Dialog>
    </>
  );
}

export default function SurveysPage() {
  return (
    <OrgGate permission="engagement.participate" module="engagement">
      <Surveys />
    </OrgGate>
  );
}
