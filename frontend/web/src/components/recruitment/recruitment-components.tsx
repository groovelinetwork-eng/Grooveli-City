'use client';

import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  DEMO_TODAY,
  DISTRICTS,
  TALENT_POOL,
  addDays,
  candidateToMatchInput,
  matchJob,
  talentToMatchInput,
  type Application,
  type EmploymentType,
  type ExperienceLevel,
  type Interview,
  type Job,
  type MatchInput,
  type WorkMode,
} from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { DEMO_CANDIDATE_ID } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, MockNotice } from '@/components/ui/primitives';
import { SelectField, TextArea, TextField } from '@/components/ui/form';
import { Dialog } from '@/components/ui/widgets';
import { FitBadge } from '@/components/jobs/job-components';

export interface ApplicantInfo {
  name: string;
  headline: string;
  yearsExperience: number;
  skills: { name: string; level: number }[];
  input: MatchInput;
  isDemoCandidate: boolean;
}

/** Professional view of an applicant. Never includes personality, gender or avatar-derived signals. */
export function useApplicantInfo(candidateId: string): ApplicantInfo | null {
  const candidate = useDemoStore((s) => s.candidate);
  return useMemo(() => {
    if (candidateId === DEMO_CANDIDATE_ID) {
      return {
        name: candidate.displayName,
        headline: candidate.headline,
        yearsExperience: candidate.yearsExperience,
        skills: candidate.skills,
        input: candidateToMatchInput(candidate),
        isDemoCandidate: true,
      };
    }
    const t = TALENT_POOL.find((x) => x.id === candidateId);
    if (!t) return null;
    return { name: t.name, headline: t.headline, yearsExperience: t.yearsExperience, skills: t.skills, input: talentToMatchInput(t), isDemoCandidate: false };
  }, [candidateId, candidate]);
}

export function MatchExplanation({ input, job }: { input: MatchInput; job: Job }) {
  const m = matchJob(input, job);
  return (
    <div className="stack" style={{ ['--gap' as string]: '6px' }}>
      <div className="row">
        <FitBadge match={m} />
        <span className="small muted">Explainable heuristic — skills + hard constraints. No personality or demographic inputs.</span>
      </div>
      <ul className="small" style={{ paddingLeft: 20 }}>
        {m.reasons.slice(0, 4).map((r) => (
          <li key={r}>✓ {r}</li>
        ))}
        {m.gaps.map((g) => (
          <li key={g}>△ {g}</li>
        ))}
      </ul>
    </div>
  );
}

export function ApplicantDetail({ application, job }: { application: Application; job: Job }) {
  const info = useApplicantInfo(application.candidateId);
  if (!info) return <p className="muted">Candidate profile unavailable.</p>;
  return (
    <div className="stack">
      <div>
        <strong>{info.name}</strong> {info.isDemoCandidate ? <Badge tone="primary">Demo candidate persona</Badge> : <Badge tone="mock">Synthetic talent</Badge>}
        <p className="small muted">
          {info.headline} · {info.yearsExperience} yrs
        </p>
      </div>
      <div className="row">{info.skills.map((s) => <Badge key={s.name}>{s.name} {s.level}</Badge>)}</div>
      <MatchExplanation input={info.input} job={job} />
      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>
          Cover note
        </summary>
        <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
          {application.coverLetter}
        </p>
      </details>
    </div>
  );
}

export function ScheduleInterviewDialog({ application, job, open, onClose }: { application: Application | null; job: Job | null; open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(addDays(DEMO_TODAY, 2));
  const [time, setTime] = useState('10:00');
  const [format, setFormat] = useState<Interview['format']>('video');
  const [interviewers, setInterviewers] = useState('Zainab Bello');
  const schedule = useAction(
    () =>
      getService().recruitment.scheduleInterview({
        applicationId: application!.id,
        jobId: job!.id,
        candidateId: application!.candidateId,
        candidateName: application!.candidateName,
        scheduledAt: `${date}T${time}:00.000Z`,
        durationMin: 45,
        format,
        interviewers: interviewers.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    { success: 'Interview scheduled (simulated — no calendar invite sent)' },
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Schedule interview${application ? `: ${application.candidateName}` : ''}`}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            pending={schedule.pending}
            onClick={async () => {
              if (await schedule.run()) onClose();
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="grid-2">
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Time (UTC)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <SelectField
        label="Format"
        value={format}
        onChange={(e) => setFormat(e.target.value as Interview['format'])}
        options={[
          { value: 'video', label: 'Video call' },
          { value: 'onsite', label: 'Onsite' },
          { value: 'phone', label: 'Phone' },
          { value: 'virtual-hq', label: 'Virtual HQ (city)' },
        ]}
      />
      <TextField label="Interviewers" hint="Comma separated" value={interviewers} onChange={(e) => setInterviewers(e.target.value)} />
    </Dialog>
  );
}

export function VacancyEditor({ initial, onSaved }: { initial: Job; onSaved: (id: string) => void }) {
  const [j, setJ] = useState<Job>(initial);
  const set = <K extends keyof Job>(k: K, v: Job[K]) => setJ((x) => ({ ...x, [k]: v }));
  const departments = useDemoStore(useShallow((s) => s.workspaces.find((w) => w.organizationId === initial.organizationId)?.departments ?? []));
  const save = useAction((job: Job) => getService().recruitment.saveVacancy(job), {
    success: (r) => (r ? 'Vacancy saved' : null),
  });
  const [improved, setImproved] = useState(false);
  const errors = {
    title: j.title.trim().length < 3 ? 'Enter a job title.' : null,
    salary: j.salaryMin > j.salaryMax ? 'Minimum cannot exceed maximum.' : null,
    skills: j.skills.length === 0 ? 'Add at least one skill.' : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const submit = async (status: Job['status']) => {
    const r = await save.run({ ...j, status });
    if (r) onSaved(r.jobId);
  };
  const improve = () => {
    // Rule-based helper (not AI): structure responsibilities and add inclusive-language note.
    setJ((x) => ({
      ...x,
      description: `${x.description.trim()}\n\nWe welcome applicants from all backgrounds. If you meet most — not all — of the requirements, we'd still like to hear from you.`.trim(),
      responsibilities: x.responsibilities.length ? x.responsibilities : [`Deliver core ${x.skills[0] ?? 'role'} outcomes`, 'Collaborate across teams', 'Document and share learning'],
    }));
    setImproved(true);
  };
  return (
    <div className="stack">
      <Card title="Role">
        <div className="grid-2">
          <TextField label="Job title" value={j.title} onChange={(e) => set('title', e.target.value)} error={errors.title} required />
          <SelectField
            label="Department"
            value={j.department}
            onChange={(e) => set('department', e.target.value)}
            options={[{ value: '', label: '—' }, ...departments.map((d) => ({ value: d.name, label: d.name }))]}
          />
          <SelectField
            label="Work arrangement"
            value={j.workMode}
            onChange={(e) => set('workMode', e.target.value as WorkMode)}
            options={['remote', 'hybrid', 'onsite'].map((v) => ({ value: v, label: v }))}
          />
          <SelectField
            label="Employment type"
            value={j.employmentType}
            onChange={(e) => set('employmentType', e.target.value as EmploymentType)}
            options={['full-time', 'part-time', 'contract', 'internship', 'freelance'].map((v) => ({ value: v, label: v }))}
          />
          <SelectField label="Level" value={j.level} onChange={(e) => set('level', e.target.value as ExperienceLevel)} options={['entry', 'mid', 'senior', 'lead'].map((v) => ({ value: v, label: v }))} />
          <TextField label="Minimum years" type="number" min={0} value={j.minYears} onChange={(e) => set('minYears', Math.max(0, Number(e.target.value) || 0))} />
          <TextField label="Salary min (₦/month)" type="number" min={0} step={10000} value={j.salaryMin} onChange={(e) => set('salaryMin', Math.max(0, Number(e.target.value) || 0))} error={errors.salary} />
          <TextField label="Salary max (₦/month)" type="number" min={0} step={10000} value={j.salaryMax} onChange={(e) => set('salaryMax', Math.max(0, Number(e.target.value) || 0))} />
          <TextField label="Location" value={j.location} onChange={(e) => set('location', e.target.value)} />
          <SelectField label="City district" value={j.district} onChange={(e) => set('district', e.target.value as Job['district'])} options={DISTRICTS.filter((d) => d.industries.length).map((d) => ({ value: d.id, label: d.name }))} />
          <TextField label="Closes on" type="date" value={j.closesOn} onChange={(e) => set('closesOn', e.target.value)} />
        </div>
      </Card>
      <Card title="Requirements">
        <div className="stack">
          <TextField
            label="Skills (comma separated)"
            value={j.skills.join(', ')}
            onChange={(e) => set('skills', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            error={errors.skills}
          />
          <TextField
            label="Mandatory qualifications (comma separated)"
            value={j.requiredQualifications.join(', ')}
            onChange={(e) => set('requiredQualifications', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          />
        </div>
      </Card>
      <Card title="Description" actions={<Button size="sm" onClick={improve}>Improve description (rule-based)</Button>}>
        {improved ? <MockNotice title="Template helper">Added standard inclusive-language text and responsibilities. This is a template, not AI.</MockNotice> : null}
        <TextArea label="Description" value={j.description} onChange={(e) => set('description', e.target.value)} rows={6} />
        <TextArea
          label="Responsibilities (one per line)"
          value={j.responsibilities.join('\n')}
          onChange={(e) => set('responsibilities', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
        />
      </Card>
      <div className="row">
        <Button variant="primary" disabled={invalid} pending={save.pending} onClick={() => submit('published')}>
          {initial.status === 'published' ? 'Save & keep published' : 'Publish vacancy'}
        </Button>
        <Button disabled={invalid} pending={save.pending} onClick={() => submit('draft')}>
          Save as draft
        </Button>
      </div>
      <p className="small muted">Published vacancies appear on the public job board and on your virtual HQ careers board.</p>
    </div>
  );
}

export function blankVacancy(organizationId: string, district: Job['district']): Job {
  return {
    id: '',
    organizationId,
    title: '',
    department: '',
    district,
    location: 'Grooveli City',
    workMode: 'hybrid',
    employmentType: 'full-time',
    level: 'mid',
    minYears: 2,
    salaryMin: 300_000,
    salaryMax: 500_000,
    skills: [],
    requiredQualifications: [],
    description: '',
    responsibilities: [],
    postedOn: DEMO_TODAY,
    closesOn: addDays(DEMO_TODAY, 30),
    status: 'draft',
  };
}
