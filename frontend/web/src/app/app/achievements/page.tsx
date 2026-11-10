'use client';

import { useMemo } from 'react';
import { useDemoStore } from '@/lib/store/store';
import { candidateApplications, useAchievements, useCareerProgress } from '@/lib/store/selectors';
import { Badge, Card, PageHeader, Stat } from '@/components/ui/primitives';

export default function AchievementsPage() {
  const achievements = useAchievements();
  const progress = useCareerProgress();
  const state = useDemoStore();
  const apps = useMemo(() => candidateApplications(state), [state]);
  const offers = apps.filter((a) => a.status === 'offer' || a.status === 'hired').length;
  const interviews = state.interviews.filter((i) => i.candidateId === state.candidate.id).length;
  const unlocked = achievements.filter((a) => a.unlocked).length;
  return (
    <>
      <PageHeader title="Achievements & career stats" description="Your trophy shelf. Unlocks are computed locally; authoritative achievements are backend-owned." />
      <div className="grid" style={{ ['--min' as string]: '150px', marginBottom: 20 }}>
        <Stat label="Career level" value={progress.level} />
        <Stat label="Missions completed" value={state.missionsClaimed.length} />
        <Stat label="Certifications" value={state.candidate.certifications.length} />
        <Stat label="Applications" value={apps.length} />
        <Stat label="Interviews" value={interviews} />
        <Stat label="Offers" value={offers} />
      </div>
      <Card title={`Achievements (${unlocked}/${achievements.length})`}>
        <ul className="grid" style={{ ['--min' as string]: '200px', listStyle: 'none', padding: 0 }}>
          {achievements.map((a) => (
            <li key={a.id} className="card stack" style={{ opacity: a.unlocked ? 1 : 0.55, boxShadow: 'none', ['--gap' as string]: '4px' }}>
              <span style={{ fontSize: 32 }} aria-hidden="true">
                {a.unlocked ? a.icon : '🔒'}
              </span>
              <strong>{a.title}</strong>
              <span className="small muted">{a.description}</span>
              <span>{a.unlocked ? <Badge tone="success">Unlocked</Badge> : <Badge>Locked</Badge>}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
