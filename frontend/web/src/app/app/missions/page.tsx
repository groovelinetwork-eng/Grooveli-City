'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MAX_REWARDED_APPLICATIONS_PER_DAY,
  MISSIONS,
  SKILL_CHALLENGES,
  XP_RULES,
  formatDateTime,
  getDistrict,
  parseDistrict,
  type SkillChallenge,
} from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { objectiveDone, useCareerProgress } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, InfoNotice, PageHeader, ProgressBar } from '@/components/ui/primitives';
import { ChoiceChips, SelectField, TextArea } from '@/components/ui/form';
import { Dialog, Tabs } from '@/components/ui/widgets';

function QuizRunner({ challenge, onClose }: { challenge: SkillChallenge; onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const complete = useAction((score: number) => getService().career.completeChallenge(challenge.id, score, challenge.questions.length), {
    success: (r) => (r.xp.award ? `Challenge complete · +${r.xp.award} XP` : r.xp.reason),
  });
  const score = challenge.questions.filter((q) => answers[q.id] === q.answer).length;
  return (
    <div className="stack">
      {challenge.questions.map((q, i) => (
        <fieldset key={q.id} className="field">
          <legend>
            {i + 1}. {q.prompt}
          </legend>
          <div className="stack" style={{ ['--gap' as string]: '4px', marginTop: 6 }}>
            {q.options.map((o, oi) => (
              <label key={o} className="check">
                <input type="radio" name={q.id} checked={answers[q.id] === oi} disabled={submitted} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />
                <span>
                  {o}
                  {submitted && oi === q.answer ? ' ✅' : ''}
                  {submitted && answers[q.id] === oi && oi !== q.answer ? ' ❌' : ''}
                </span>
              </label>
            ))}
          </div>
          {submitted ? <p className="small muted">{q.explanation}</p> : null}
        </fieldset>
      ))}
      {submitted ? (
        <div className="row-between">
          <strong role="status">
            Score: {score}/{challenge.questions.length}
          </strong>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <Button
          variant="primary"
          disabled={Object.keys(answers).length < challenge.questions.length}
          pending={complete.pending}
          onClick={async () => {
            await complete.run(score);
            setSubmitted(true);
          }}
        >
          Submit answers
        </Button>
      )}
    </div>
  );
}

const STAR_QUESTIONS = [
  'Tell me about a time you handled a difficult stakeholder.',
  'Describe a project where you improved a process. What was the measurable result?',
  'Why do you want this role, and what will you achieve in your first 90 days?',
];
const STAR_CHECKS = ['Situation set clearly', 'Task / your responsibility explained', 'Specific actions you took', 'Measurable result'];

function InterviewSimulation() {
  const roles = useDemoStore((s) => s.candidate.preferences.desiredRoles);
  const [role, setRole] = useState(roles[0] ?? 'General');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [checks, setChecks] = useState<boolean[][]>(STAR_QUESTIONS.map(() => STAR_CHECKS.map(() => false)));
  const [finished, setFinished] = useState<number | null>(null);
  const record = useAction((score: number) => getService().career.recordInterviewSimulation(role, score), {
    success: (r) => (r.xp.award ? `Simulation complete · +${r.xp.award} XP` : 'Simulation recorded'),
  });
  const finish = async () => {
    const lengthScore = answers.reduce((a, t) => a + Math.min(1, t.trim().split(/\s+/).length / 60), 0) / answers.length;
    const starScore = checks.flat().filter(Boolean).length / (STAR_QUESTIONS.length * STAR_CHECKS.length);
    const score = Math.round((lengthScore * 0.4 + starScore * 0.6) * 100);
    await record.run(score);
    setFinished(score);
  };
  if (finished !== null) {
    return (
      <div className="stack">
        <p role="status">
          <strong>Readiness: {finished}%</strong> — based on answer depth and your STAR self-check (rule-based, not an AI assessment).
        </p>
        <ul style={{ paddingLeft: 20 }}>
          {checks.map((c, qi) =>
            c.some((x) => !x) ? (
              <li key={qi}>
                Q{qi + 1}: strengthen {STAR_CHECKS.filter((_, ci) => !c[ci]).join(', ').toLowerCase()}.
              </li>
            ) : null,
          )}
        </ul>
        <div>
          <Button
            onClick={() => {
              setFinished(null);
              setI(0);
              setAnswers(['', '', '']);
              setChecks(STAR_QUESTIONS.map(() => STAR_CHECKS.map(() => false)));
            }}
          >
            Practise again
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      <SelectField label="Role you're practising for" value={role} onChange={(e) => setRole(e.target.value)} options={(roles.length ? roles : ['General']).map((r) => ({ value: r, label: r }))} />
      <ProgressBar value={i + 1} max={STAR_QUESTIONS.length} label="Interview simulation progress" />
      <TextArea label={`Question ${i + 1}: ${STAR_QUESTIONS[i]}`} value={answers[i]} onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))} rows={6} />
      <fieldset className="field">
        <legend>Self-check: did your answer include…</legend>
        <div className="chips">
          {STAR_CHECKS.map((c, ci) => (
            <label key={c} className="check">
              <input type="checkbox" checked={checks[i]![ci]} onChange={(e) => setChecks((all) => all.map((row, qi) => (qi === i ? row.map((v, k) => (k === ci ? e.target.checked : v)) : row)))} />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row-between">
        <Button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
          Previous
        </Button>
        {i < STAR_QUESTIONS.length - 1 ? (
          <Button variant="primary" onClick={() => setI((x) => x + 1)} disabled={answers[i]!.trim().length < 20}>
            Next question
          </Button>
        ) : (
          <Button variant="primary" onClick={finish} disabled={answers[i]!.trim().length < 20} pending={record.pending}>
            Finish simulation
          </Button>
        )}
      </div>
    </div>
  );
}

function CareerAssessment() {
  const done = useDemoStore((s) => s.assessmentDone);
  const [a, setA] = useState<Record<string, string>>({});
  const submit = useAction((answers: Record<string, string>) => getService().career.completeAssessment(answers), {
    success: (r) => (r.xp.award ? `Assessment complete · +${r.xp.award} XP` : 'Assessment updated'),
  });
  return (
    <div className="stack">
      {done ? <Badge tone="success">Completed</Badge> : null}
      <ChoiceChips legend="What motivates you most at work?" value={a.motivation ?? null} onChange={(v) => setA((x) => ({ ...x, motivation: v as string }))} options={['Growth', 'Impact', 'Stability', 'Autonomy', 'Recognition'].map((v) => ({ value: v, label: v }))} />
      <ChoiceChips legend="Where do you want to be in 2 years?" value={a.goal ?? null} onChange={(v) => setA((x) => ({ ...x, goal: v as string }))} options={['Specialist', 'Team lead', 'Career change', 'Own business', 'Not sure yet'].map((v) => ({ value: v, label: v }))} />
      <ChoiceChips legend="Your biggest current blocker?" value={a.blocker ?? null} onChange={(v) => setA((x) => ({ ...x, blocker: v as string }))} options={['Skills gap', 'Experience', 'Network', 'Confidence', 'Time'].map((v) => ({ value: v, label: v }))} />
      <p className="small muted">Your answers guide mission suggestions. They are not shared with employers.</p>
      <div>
        <Button variant="primary" onClick={() => submit.run(a)} pending={submit.pending} disabled={Object.keys(a).length < 3}>
          {done ? 'Update assessment' : 'Complete assessment'}
        </Button>
      </div>
    </div>
  );
}

function Missions() {
  const params = useSearchParams();
  const district = parseDistrict(params.get('district'));
  const state = useDemoStore();
  const progress = useCareerProgress();
  const [quiz, setQuiz] = useState<SkillChallenge | null>(null);
  const claim = useAction((id: string) => getService().career.claimMission(id), { success: (r) => `Mission claimed · +${r.xp.award} XP` });
  const missions = MISSIONS.filter((m) => m.orientations === 'all' || m.orientations.includes(state.candidate.orientation));
  const challenges = useMemo(
    () => [...SKILL_CHALLENGES].sort((a, b) => (a.district === district ? -1 : 0) - (b.district === district ? -1 : 0)),
    [district],
  );
  const best = (id: string) => state.challengeResults.filter((r) => r.challengeId === id).reduce((m, r) => Math.max(m, r.score / r.total), -1);

  return (
    <>
      <PageHeader
        title="Missions & XP"
        description="Structured career activities that build real skills. XP rewards meaningful progress — never application spam."
        badge={<Badge tone="primary">Level {progress.level} · {progress.xp} XP</Badge>}
      />
      {district ? <InfoNotice>Showing {getDistrict(district).name} challenges first (you arrived from the city).</InfoNotice> : null}
      <Tabs
        label="Missions sections"
        tabs={[
          {
            id: 'missions',
            label: 'Missions',
            content: (
              <div className="grid" style={{ ['--min' as string]: '300px' }}>
                {missions.map((m) => {
                  const doneCount = m.objectives.filter((o) => objectiveDone(state, o.check)).length;
                  const claimed = state.missionsClaimed.includes(m.id);
                  return (
                    <Card key={m.id} as="article" title={<h2 style={{ fontSize: '1.05rem' }}>{m.title}</h2>} actions={<Badge tone="primary">+{m.rewardXp} XP</Badge>}>
                      <p className="small muted">{m.description}</p>
                      <ProgressBar value={doneCount} max={m.objectives.length} label={`${m.title} progress`} />
                      <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 8, ['--gap' as string]: '4px' }}>
                        {m.objectives.map((o) => {
                          const done = objectiveDone(state, o.check);
                          return (
                            <li key={o.id} className="small">
                              <span aria-hidden="true">{done ? '✅' : '⬜'}</span> {o.label}
                              <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <div style={{ marginTop: 10 }}>
                        {claimed ? (
                          <Badge tone="success">Claimed</Badge>
                        ) : (
                          <Button variant="primary" size="sm" disabled={doneCount < m.objectives.length} pending={claim.pending} onClick={() => claim.run(m.id)}>
                            Claim reward
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ),
          },
          {
            id: 'challenges',
            label: 'Skill challenges',
            content: (
              <div className="grid" style={{ ['--min' as string]: '240px' }}>
                {challenges.map((c) => {
                  const b = best(c.id);
                  return (
                    <Card key={c.id} as="article" title={<h2 style={{ fontSize: '1rem' }}>{c.title}</h2>} actions={<Badge>{getDistrict(c.district).name}</Badge>}>
                      <p className="small muted">
                        {c.skill} · {c.questions.length} questions · +{c.xp} XP (score ≥ 50%, once)
                      </p>
                      <div className="row" style={{ marginTop: 8 }}>
                        <Button size="sm" variant="primary" onClick={() => setQuiz(c)}>
                          {b >= 0 ? 'Retry' : 'Start'}
                        </Button>
                        {b >= 0 ? <Badge tone={b >= 0.5 ? 'success' : 'warning'}>Best {Math.round(b * 100)}%</Badge> : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ),
          },
          { id: 'assessment', label: 'Career assessment', content: <Card><CareerAssessment /></Card> },
          {
            id: 'interview',
            label: 'Interview simulation',
            content: (
              <Card title="Interview simulation" actions={<Badge tone="mock">Rule-based feedback</Badge>}>
                <div id="interview-sim">
                  <InterviewSimulation />
                </div>
              </Card>
            ),
          },
          {
            id: 'xp',
            label: 'XP ledger',
            content: (
              <div className="grid-2">
                <Card title="How XP works">
                  <ul className="small" style={{ paddingLeft: 20 }}>
                    {Object.entries(XP_RULES)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <li key={k}>
                          {k.replace(/-/g, ' ')}: +{v} XP
                        </li>
                      ))}
                    <li>Missions: reward shown on each mission</li>
                    <li>Applications earn XP only when the role is a suitable match, max {MAX_REWARDED_APPLICATIONS_PER_DAY}/day.</li>
                  </ul>
                  <p className="small muted" style={{ marginTop: 8 }}>
                    Example values from the product brief; authoritative XP will be calculated by the backend.
                  </p>
                </Card>
                <Card title="Recent XP">
                  {state.xp.length === 0 ? (
                    <p className="muted small">No XP yet.</p>
                  ) : (
                    <ul className="small" style={{ paddingLeft: 20 }}>
                      {[...state.xp].reverse().slice(0, 20).map((e) => (
                        <li key={e.id}>
                          +{e.amount} · {e.reason.replace(/-/g, ' ')} · {formatDateTime(e.at)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            ),
          },
        ]}
      />
      <Dialog open={!!quiz} onClose={() => setQuiz(null)} title={quiz?.title ?? ''}>
        {quiz ? <QuizRunner key={quiz.id} challenge={quiz} onClose={() => setQuiz(null)} /> : null}
      </Dialog>
    </>
  );
}

export default function MissionsPage() {
  return (
    <Suspense fallback={null}>
      <Missions />
    </Suspense>
  );
}
