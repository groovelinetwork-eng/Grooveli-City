'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  encodeAvatar,
  formatNaira,
  type CandidateProfile,
  type EmploymentType,
  type Gender,
  type ProfessionalOrientation,
  type WorkMode,
} from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { useCityHref } from '@/lib/city-link';
import { Wizard } from '@/components/wizard';
import { AvatarEditor, DEFAULT_PERSONALITY, PersonalityEditor, SkillsEditor } from '@/components/profile/editors';
import { ChoiceChips, SelectField, TextArea, TextField } from '@/components/ui/form';
import { AvatarFigure } from '@/components/ui/avatar';
import { Badge, Button, InfoNotice, LinkButton, MockNotice } from '@/components/ui/primitives';

const ORIENTATIONS: { value: ProfessionalOrientation; label: string; hint: string }[] = [
  { value: 'employee', label: 'Employee', hint: 'Full-time, part-time or contract employment' },
  { value: 'freelancer', label: 'Freelancer', hint: 'Projects, gigs and freelance engagements' },
  { value: 'entrepreneur', label: 'Entrepreneur', hint: 'Building a business or venture' },
  { value: 'student', label: 'Student / Graduate', hint: 'Internships, graduate roles, early career' },
  { value: 'open', label: 'Open to opportunities', hint: 'Exploring different arrangements' },
];

const MAX_PHOTO_BYTES = 300 * 1024;

export default function CandidateOnboardingPage() {
  const persona = useDemoStore((s) => s.session?.personaId);
  const initial = useDemoStore((s) => s.candidate);
  const [p, setP] = useState<CandidateProfile>(() => ({ ...initial, personality: initial.personality ?? DEFAULT_PERSONALITY }));
  const [shareTraits, setShareTraits] = useState(initial.personality !== null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = <K extends keyof CandidateProfile>(k: K, v: CandidateProfile[K]) => setP((cur) => ({ ...cur, [k]: v }));
  const setPref = <K extends keyof CandidateProfile['preferences']>(k: K, v: CandidateProfile['preferences'][K]) =>
    setP((cur) => ({ ...cur, preferences: { ...cur.preferences, [k]: v } }));
  const finish = useAction((profile: CandidateProfile) => getService().candidate.completeOnboarding(profile), {
    success: (r) => `Profile created${r.xp.award ? ` · +${r.xp.award} XP` : ''}`,
  });
  const cityHref = useCityHref({ district: 'apartment' });

  if (persona && persona !== 'candidate') {
    return (
      <InfoNotice>
        Candidate onboarding is for individual accounts. <Link href="/login?switch=1">Switch to the candidate persona</Link> or{' '}
        <Link href="/onboarding/organization">set up an organisation</Link>.
      </InfoNotice>
    );
  }

  if (done) {
    return (
      <section className="card stack" style={{ ['--gap' as string]: '16px', textAlign: 'center', alignItems: 'center' }} aria-labelledby="done-title">
        <div className="avatar-stage" style={{ width: 220 }}>
          <AvatarFigure avatar={p.avatar} size={150} />
        </div>
        <h1 id="done-title">Welcome to Grooveli, {p.displayName.split(' ')[0]}!</h1>
        <p className="muted">Your profile and avatar are ready. Your avatar code ({encodeAvatar(p.avatar)}) carries only appearance — no personal data.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn btn-primary" href={cityHref}>
            🏙️ Enter the city at your apartment
          </a>
          <LinkButton href="/app">Go to my dashboard</LinkButton>
        </div>
      </section>
    );
  }

  const onPhoto = (file: File | undefined) => {
    setPhotoError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) return setPhotoError('Choose an image file.');
    if (file.size > MAX_PHOTO_BYTES) return setPhotoError('Images must be under 300 KB in demo mode.');
    const reader = new FileReader();
    reader.onload = () => set('photoDataUrl', typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <header>
        <h1>Set up your Grooveli identity</h1>
        <p className="muted">About five minutes. You can change everything later.</p>
      </header>
      <MockNotice title="Stored in this browser only">Your profile is demo data kept in local storage. Nothing is uploaded.</MockNotice>
      <Wizard
        label="Candidate onboarding"
        finishLabel="Create my profile"
        pending={finish.pending}
        onFinish={async () => {
          const res = await finish.run({ ...p, personality: shareTraits ? p.personality : null });
          if (res) setDone(true);
        }}
        steps={[
          {
            id: 'identity',
            title: 'Identity',
            description: 'How you appear to others in Grooveli.',
            validate: () => (p.displayName.trim().length < 2 ? 'Enter your name.' : p.headline.trim().length < 3 ? 'Add a short professional headline.' : null),
            content: (
              <div className="stack">
                <div className="grid-2">
                  <TextField label="Display name" value={p.displayName} onChange={(e) => set('displayName', e.target.value)} required maxLength={60} />
                  <TextField label="Location" value={p.location} onChange={(e) => set('location', e.target.value)} maxLength={60} />
                </div>
                <TextField
                  label="Professional headline"
                  value={p.headline}
                  onChange={(e) => set('headline', e.target.value)}
                  placeholder="e.g. HR Operations Specialist · open to remote roles"
                  required
                  maxLength={120}
                />
                <SelectField
                  label="Gender (optional)"
                  hint="Optional. Never used for matching or ranking."
                  value={p.gender ?? ''}
                  onChange={(e) => set('gender', (e.target.value || null) as Gender | null)}
                  options={[
                    { value: '', label: 'Prefer not to say' },
                    { value: 'female', label: 'Female' },
                    { value: 'male', label: 'Male' },
                    { value: 'non-binary', label: 'Non-binary' },
                    { value: 'self-describe', label: 'Self-describe' },
                  ]}
                />
                <div className="field">
                  <label htmlFor="photo">Profile photo (optional)</label>
                  <input id="photo" type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
                  <span className="hint">Kept in this browser only. Max 300 KB.</span>
                  {photoError ? (
                    <span className="error" role="alert">
                      {photoError}
                    </span>
                  ) : null}
                  {p.photoDataUrl ? (
                    <div className="row" style={{ marginTop: 6 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.photoDataUrl} alt="Your profile photo preview" width={64} height={64} style={{ borderRadius: '50%', objectFit: 'cover' }} />
                      <Button size="sm" variant="ghost" onClick={() => set('photoDataUrl', null)}>
                        Remove photo
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          },
          {
            id: 'avatar',
            title: 'Avatar & style',
            description: 'Customise how you look when exploring the city.',
            content: <AvatarEditor value={p.avatar} onChange={(a) => set('avatar', a)} />,
          },
          {
            id: 'personality',
            title: 'Personality & social',
            optional: true,
            description: 'Helps us suggest communities, events and social spaces you might enjoy.',
            content: (
              <div className="stack">
                <InfoNotice>
                  Personality preferences personalise <strong>social</strong> experiences only. They are <strong>never</strong> used to rank you for jobs or
                  shown to employers as a suitability score.
                </InfoNotice>
                <label className="check">
                  <input type="checkbox" checked={shareTraits} onChange={(e) => setShareTraits(e.target.checked)} />
                  <span>Use my personality preferences to personalise social suggestions</span>
                </label>
                {shareTraits ? <PersonalityEditor value={p.personality ?? DEFAULT_PERSONALITY} onChange={(v) => set('personality', v)} /> : null}
              </div>
            ),
          },
          {
            id: 'orientation',
            title: 'Professional orientation',
            description: 'Shapes job recommendations, missions and opportunities shown across the city.',
            validate: () => (p.preferences.desiredRoles.length === 0 ? 'Add at least one role you are interested in.' : null),
            content: (
              <div className="stack">
                <ChoiceChips<ProfessionalOrientation>
                  legend="I am mainly…"
                  value={p.orientation}
                  onChange={(v) => set('orientation', v as ProfessionalOrientation)}
                  options={ORIENTATIONS.map((o) => ({ value: o.value, label: `${o.label} — ${o.hint}` }))}
                />
                <TextField
                  label="Roles I'm interested in"
                  hint="Comma separated"
                  value={p.preferences.desiredRoles.join(', ')}
                  onChange={(e) =>
                    setPref(
                      'desiredRoles',
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .slice(0, 8),
                    )
                  }
                />
                <ChoiceChips<WorkMode>
                  legend="Work arrangements"
                  multiple
                  value={p.preferences.workModes}
                  onChange={(v) => setPref('workModes', v as WorkMode[])}
                  options={[
                    { value: 'remote', label: 'Remote' },
                    { value: 'hybrid', label: 'Hybrid' },
                    { value: 'onsite', label: 'Onsite' },
                  ]}
                />
                <ChoiceChips<EmploymentType>
                  legend="Employment types"
                  multiple
                  value={p.preferences.employmentTypes}
                  onChange={(v) => setPref('employmentTypes', v as EmploymentType[])}
                  options={[
                    { value: 'full-time', label: 'Full-time' },
                    { value: 'part-time', label: 'Part-time' },
                    { value: 'contract', label: 'Contract' },
                    { value: 'internship', label: 'Internship' },
                    { value: 'freelance', label: 'Freelance' },
                  ]}
                />
                <SelectField
                  label="Minimum monthly salary"
                  value={String(p.preferences.minSalary)}
                  onChange={(e) => setPref('minSalary', Number(e.target.value))}
                  options={[0, 150_000, 200_000, 300_000, 500_000, 800_000, 1_000_000].map((n) => ({
                    value: String(n),
                    label: n ? formatNaira(n) : 'No minimum',
                  }))}
                />
              </div>
            ),
          },
          {
            id: 'cv',
            title: 'CV & profile',
            description: 'Your professional story. Employers see an appropriate professional version.',
            validate: () => (p.skills.length < 1 ? 'Add at least one skill.' : null),
            content: (
              <div className="stack">
                <TextArea label="Summary" value={p.summary} onChange={(e) => set('summary', e.target.value)} maxLength={800} hint="2–3 sentences focusing on outcomes." />
                <TextField
                  label="Years of experience"
                  type="number"
                  min={0}
                  max={50}
                  value={p.yearsExperience}
                  onChange={(e) => set('yearsExperience', Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                />
                <h3>Skills</h3>
                <SkillsEditor value={p.skills} onChange={(s) => set('skills', s)} />
                <TextField
                  label="Certifications"
                  hint="Comma separated"
                  value={p.certifications.join(', ')}
                  onChange={(e) =>
                    set(
                      'certifications',
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                />
                <div className="field">
                  <label htmlFor="cv-file">Attach CV (optional)</label>
                  <input
                    id="cv-file"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) set('cvFile', { name: f.name, sizeKb: Math.round(f.size / 1024), addedAt: new Date().toISOString() });
                    }}
                  />
                  <span className="hint">Only the file name and size are recorded — the file is not uploaded or read.</span>
                  {p.cvFile ? <Badge tone="success">Attached: {p.cvFile.name}</Badge> : null}
                </div>
                <SelectField
                  label="Profile visibility"
                  value={p.visibility}
                  onChange={(e) => set('visibility', e.target.value as CandidateProfile['visibility'])}
                  options={[
                    { value: 'employers', label: 'Visible to employers' },
                    { value: 'public', label: 'Public' },
                    { value: 'private', label: 'Private' },
                  ]}
                />
              </div>
            ),
          },
          {
            id: 'review',
            title: 'Finish',
            content: (
              <div className="grid-2">
                <div className="avatar-stage">
                  <AvatarFigure avatar={p.avatar} size={150} />
                </div>
                <dl className="stack" style={{ ['--gap' as string]: '6px' }}>
                  <dt className="small muted">Name</dt>
                  <dd>{p.displayName}</dd>
                  <dt className="small muted">Headline</dt>
                  <dd>{p.headline}</dd>
                  <dt className="small muted">Orientation</dt>
                  <dd>{ORIENTATIONS.find((o) => o.value === p.orientation)?.label}</dd>
                  <dt className="small muted">Interested in</dt>
                  <dd>{p.preferences.desiredRoles.join(', ') || '—'}</dd>
                  <dt className="small muted">Skills</dt>
                  <dd>{p.skills.map((s) => s.name).join(', ')}</dd>
                  <dt className="small muted">Personality used for social suggestions</dt>
                  <dd>{shareTraits ? 'Yes' : 'No'}</dd>
                </dl>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
