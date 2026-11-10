'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { COURSES, SKILL_CHALLENGES, candidateToMatchInput, rankJobs, type SkillRating } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Button, Card, PageHeader } from '@/components/ui/primitives';
import { BarChart } from '@/components/ui/widgets';
import { SkillsEditor } from '@/components/profile/editors';

export default function SkillsPage() {
  const candidate = useDemoStore((s) => s.candidate);
  const jobs = useDemoStore((s) => s.jobs);
  const results = useDemoStore((s) => s.challengeResults);
  const [skills, setSkills] = useState<SkillRating[]>(candidate.skills);
  const save = useAction((s: SkillRating[]) => getService().candidate.updateProfile({ skills: s }), { success: 'Skills saved' });
  const demand = useMemo(() => {
    const ranked = rankJobs(candidateToMatchInput(candidate), jobs.filter((j) => j.status === 'published')).slice(0, 12);
    const counts = new Map<string, number>();
    for (const r of ranked) for (const s of r.match.missingSkills) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [candidate, jobs]);
  const dirty = JSON.stringify(skills) !== JSON.stringify(candidate.skills);

  return (
    <>
      <PageHeader title="Skills" description="Self-rated skills drive job fit. Verified levels from assessments will come from the backend." />
      <div className="grid-2">
        <Card title="Your skills" actions={<Button variant="primary" size="sm" disabled={!dirty} pending={save.pending} onClick={() => save.run(skills)}>Save</Button>}>
          <SkillsEditor value={skills} onChange={setSkills} />
        </Card>
        <div className="stack">
          <Card title="Skill levels">
            <BarChart horizontal title="Self-rated skill levels" data={candidate.skills.map((s) => ({ label: s.name, value: s.level }))} />
          </Card>
          <Card title="In demand for roles that fit you">
            {demand.length === 0 ? (
              <p className="muted small">Your skills cover your best-fit roles.</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, ['--gap' as string]: '6px' }}>
                {demand.map(([skill, n]) => {
                  const course = COURSES.find((c) => c.skill === skill);
                  const challenge = SKILL_CHALLENGES.find((c) => c.skill === skill);
                  return (
                    <li key={skill} className="row-between">
                      <span>
                        <strong>{skill}</strong> <span className="small muted">· asked by {n} roles</span>
                      </span>
                      <span className="small">
                        {course ? <Link href="/app/learning">Course</Link> : null}
                        {course && challenge ? ' · ' : null}
                        {challenge ? <Link href="/app/missions">Challenge</Link> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="Challenge results">
            {results.length === 0 ? (
              <p className="muted small">No challenges attempted yet.</p>
            ) : (
              <ul className="small" style={{ paddingLeft: 20 }}>
                {results.map((r, i) => (
                  <li key={i}>
                    {SKILL_CHALLENGES.find((c) => c.id === r.challengeId)?.title}: {r.score}/{r.total}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
