'use client';

import { useMemo } from 'react';
import { COURSES, candidateToMatchInput, rankJobs } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Card, PageHeader, ProgressBar } from '@/components/ui/primitives';
import { Checkbox } from '@/components/ui/form';

export default function LearningPage() {
  const candidate = useDemoStore((s) => s.candidate);
  const jobs = useDemoStore((s) => s.jobs);
  const progress = useDemoStore((s) => s.courseProgress);
  const toggle = useAction((courseId: string, i: number) => getService().career.toggleCourseModule(courseId, i), {
    success: (r) => (r.completed && r.xp?.award ? `Course complete · +${r.xp.award} XP` : null),
  });
  const gapSkills = useMemo(() => {
    const ranked = rankJobs(candidateToMatchInput(candidate), jobs.filter((j) => j.status === 'published')).slice(0, 10);
    return new Set(ranked.flatMap((r) => r.match.missingSkills));
  }, [candidate, jobs]);
  const courses = [...COURSES].sort((a, b) => Number(gapSkills.has(b.skill)) - Number(gapSkills.has(a.skill)));

  return (
    <>
      <PageHeader title="Learning paths" description="Courses recommended from the skill gaps in jobs that fit you. Course content is a synthetic outline." />
      <div className="grid" style={{ ['--min' as string]: '300px' }}>
        {courses.map((c) => {
          const done = progress[c.id] ?? [];
          return (
            <Card
              key={c.id}
              as="article"
              title={<h2 style={{ fontSize: '1.05rem' }}>{c.title}</h2>}
              actions={gapSkills.has(c.skill) ? <Badge tone="warning">Closes a gap</Badge> : <Badge>{c.skill}</Badge>}
            >
              <p className="small muted">
                {c.provider} · {c.hours}h · +{c.xp} XP on completion
              </p>
              <ProgressBar value={done.length} max={c.modules.length} label={`${c.title} progress`} />
              <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 10, ['--gap' as string]: '4px' }}>
                {c.modules.map((m, i) => (
                  <li key={m}>
                    <Checkbox label={m} checked={done.includes(i)} onChange={() => toggle.run(c.id, i)} />
                  </li>
                ))}
              </ul>
              {done.length === c.modules.length ? (
                <div style={{ marginTop: 8 }}>
                  <Badge tone="success">Completed</Badge>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
