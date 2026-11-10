'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  MISSIONS,
  candidateToMatchInput,
  formatDateTime,
  rankJobs,
} from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { candidateApplications, objectiveDone, profileStrength, useCareerProgress } from '@/lib/store/selectors';
import { Badge, Card, LinkButton, ProgressBar, Stat } from '@/components/ui/primitives';
import { AvatarFigure } from '@/components/ui/avatar';
import { FitBadge } from '@/components/jobs/job-components';
import { EnterCityButton } from '@/components/enter-city-button';

export default function CandidateDashboard() {
  const state = useDemoStore();
  const progress = useCareerProgress();
  const c = state.candidate;
  const apps = useMemo(() => candidateApplications(state), [state]);
  const interviews = state.interviews.filter((i) => i.candidateId === c.id && i.status === 'scheduled');
  const recommended = useMemo(
    () =>
      rankJobs(
        candidateToMatchInput(c),
        state.jobs.filter((j) => j.status === 'published' && !apps.some((a) => a.jobId === j.id)),
      ).slice(0, 4),
    [c, state.jobs, apps],
  );
  const nextMission = MISSIONS.find(
    (m) => !state.missionsClaimed.includes(m.id) && (m.orientations === 'all' || m.orientations.includes(c.orientation)),
  );
  const strength = profileStrength(c);

  return (
    <div className="stack" style={{ ['--gap' as string]: '20px' }}>
      <section className="card" style={{ background: 'linear-gradient(120deg, var(--g-navy-900), var(--g-navy-700))', color: '#fff' }}>
        <div className="row-between">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <div className="avatar-stage" style={{ padding: 6 }}>
              <AvatarFigure avatar={c.avatar} size={72} />
            </div>
            <div>
              <h1 style={{ color: '#fff' }}>Welcome back, {c.displayName.split(' ')[0]}</h1>
              <p style={{ color: '#c7d2fe' }}>{c.headline}</p>
              <div style={{ maxWidth: 360, marginTop: 8 }}>
                <ProgressBar value={progress.xpIntoLevel} max={progress.xpForNextLevel} label="Progress to next career level" />
                <p className="small" style={{ color: '#c7d2fe', marginTop: 4 }}>
                  Level {progress.level} · {progress.xpIntoLevel}/{progress.xpForNextLevel} XP to level {progress.level + 1}
                </p>
              </div>
            </div>
          </div>
          <div className="row">
            <EnterCityButton district="apartment" label="Go to my apartment" className="btn btn-primary" />
            {!state.candidateOnboarded ? <LinkButton href="/onboarding/candidate">Finish onboarding</LinkButton> : null}
          </div>
        </div>
      </section>

      <div className="grid" style={{ ['--min' as string]: '160px' }}>
        <Stat label="Career level" value={progress.level} hint={`${progress.xp} XP total`} />
        <Stat label="Applications" value={apps.length} hint={`${apps.filter((a) => ['submitted', 'screening'].includes(a.status)).length} awaiting update`} />
        <Stat label="Upcoming interviews" value={interviews.length} />
        <Stat label="Reputation" value={progress.reputation} hint="Illustrative" />
        <Stat label="Profile strength" value={`${strength}%`} />
      </div>

      <div className="grid-2">
        <Card title="Recommended for you" actions={<Link href="/app/jobs">See all</Link>}>
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {recommended.map(({ job, match }) => (
              <li key={job.id} className="row-between">
                <div>
                  <Link href={`/app/jobs/${job.id}`}>{job.title}</Link>
                  <p className="small muted">{state.organizations.find((o) => o.id === job.organizationId)?.name}</p>
                </div>
                <FitBadge match={match} />
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ marginTop: 8 }}>
            Ranked by a transparent skills + constraints heuristic. Personality is never used.
          </p>
        </Card>
        <Card title="Next mission" actions={<Link href="/app/missions">All missions</Link>}>
          {nextMission ? (
            <div className="stack">
              <h3>{nextMission.title}</h3>
              <ul className="stack" style={{ listStyle: 'none', padding: 0, ['--gap' as string]: '4px' }}>
                {nextMission.objectives.map((o) => {
                  const done = objectiveDone(state, o.check);
                  return (
                    <li key={o.id}>
                      <span aria-hidden="true">{done ? '✅' : '⬜'}</span> {o.label}
                      <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
                    </li>
                  );
                })}
              </ul>
              <Badge tone="primary">Reward +{nextMission.rewardXp} XP</Badge>
            </div>
          ) : (
            <p className="muted">All missions claimed — great work.</p>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Upcoming interviews" actions={<Link href="/app/interviews">Manage</Link>}>
          {interviews.length === 0 ? (
            <p className="muted small">No interviews scheduled yet.</p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {interviews.map((i) => (
                <li key={i.id} className="row-between">
                  <span>{state.jobs.find((j) => j.id === i.jobId)?.title}</span>
                  <span className="small muted">{formatDateTime(i.scheduledAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="AI Career Center" actions={<Badge tone="mock">Simulated assistant</Badge>}>
          <p className="muted small">Get guidance on jobs, skills gaps, your CV and interviews. Rule-based in this build — no AI inference.</p>
          <div style={{ marginTop: 12 }}>
            <LinkButton href="/app/career-center" variant="primary">
              Open Career Center
            </LinkButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
