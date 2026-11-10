'use client';

import { useState } from 'react';
import { type CandidateProfile, type ProfessionalOrientation } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { profileStrength, useCareerProgress } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, InfoNotice, PageHeader, ProgressBar } from '@/components/ui/primitives';
import { ChoiceChips, SelectField, TextArea, TextField } from '@/components/ui/form';
import { Tabs } from '@/components/ui/widgets';
import { AvatarEditor, DEFAULT_PERSONALITY, PersonalityEditor } from '@/components/profile/editors';
import { AvatarFigure } from '@/components/ui/avatar';
import { EnterCityButton } from '@/components/enter-city-button';

export default function ProfilePage() {
  const saved = useDemoStore((s) => s.candidate);
  const progress = useCareerProgress();
  const [p, setP] = useState<CandidateProfile>(saved);
  const save = useAction((patch: Partial<CandidateProfile>) => getService().candidate.updateProfile(patch), {
    success: (r) => (r.xp?.award ? `Saved · +${r.xp.award} XP for completing your profile` : 'Profile saved'),
  });
  const set = <K extends keyof CandidateProfile>(k: K, v: CandidateProfile[K]) => setP((c) => ({ ...c, [k]: v }));
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  const strength = profileStrength(saved);

  return (
    <>
      <PageHeader
        title="Profile & avatar"
        description="Your career identity. Employers see a professional version; personality and gender are never shown as suitability signals."
        actions={
          <Button variant="primary" disabled={!dirty} pending={save.pending} onClick={() => save.run(p)}>
            Save changes
          </Button>
        }
      />
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <div className="avatar-stage" style={{ padding: 8 }}>
              <AvatarFigure avatar={saved.avatar} size={90} />
            </div>
            <div className="stack" style={{ ['--gap' as string]: '4px' }}>
              <h2>{saved.displayName}</h2>
              <p className="muted small">{saved.headline}</p>
              <div className="row">
                <Badge tone="primary">Level {progress.level}</Badge>
                <Badge>Reputation {progress.reputation}</Badge>
                <Badge>{saved.yearsExperience} yrs experience</Badge>
              </div>
            </div>
          </div>
        </Card>
        <Card title="Profile strength">
          <ProgressBar value={strength} label="Profile strength" />
          <p className="small muted" style={{ marginTop: 6 }}>
            {strength}% complete. Add a photo, CV, education and certifications to strengthen it.
          </p>
          <div style={{ marginTop: 10 }}>
            <EnterCityButton district="apartment" label="See your avatar in the city" />
          </div>
        </Card>
      </div>
      <Tabs
        label="Profile sections"
        tabs={[
          {
            id: 'identity',
            label: 'Identity',
            content: (
              <Card>
                <div className="grid-2">
                  <TextField label="Display name" value={p.displayName} onChange={(e) => set('displayName', e.target.value)} maxLength={60} />
                  <TextField label="Location" value={p.location} onChange={(e) => set('location', e.target.value)} />
                  <TextField label="Headline" value={p.headline} onChange={(e) => set('headline', e.target.value)} maxLength={120} />
                  <TextField label="Years of experience" type="number" min={0} max={50} value={p.yearsExperience} onChange={(e) => set('yearsExperience', Math.max(0, Number(e.target.value) || 0))} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <TextArea label="Summary" value={p.summary} onChange={(e) => set('summary', e.target.value)} maxLength={800} />
                </div>
                <div className="grid-2" style={{ marginTop: 12 }}>
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
                  <SelectField
                    label="Gender (optional, never used for matching)"
                    value={p.gender ?? ''}
                    onChange={(e) => set('gender', (e.target.value || null) as CandidateProfile['gender'])}
                    options={[
                      { value: '', label: 'Prefer not to say' },
                      { value: 'female', label: 'Female' },
                      { value: 'male', label: 'Male' },
                      { value: 'non-binary', label: 'Non-binary' },
                      { value: 'self-describe', label: 'Self-describe' },
                    ]}
                  />
                </div>
              </Card>
            ),
          },
          { id: 'avatar', label: 'Avatar', content: <Card><AvatarEditor value={p.avatar} onChange={(a) => set('avatar', a)} /></Card> },
          {
            id: 'personality',
            label: 'Personality & social',
            content: (
              <Card>
                <InfoNotice>Used only to personalise social suggestions (communities, events). Never used for job matching or shown to employers.</InfoNotice>
                <div style={{ marginTop: 12 }}>
                  <label className="check">
                    <input type="checkbox" checked={p.personality !== null} onChange={(e) => set('personality', e.target.checked ? DEFAULT_PERSONALITY : null)} />
                    <span>Personalise social suggestions with my personality preferences</span>
                  </label>
                </div>
                {p.personality ? (
                  <div style={{ marginTop: 12 }}>
                    <PersonalityEditor value={p.personality} onChange={(v) => set('personality', v)} />
                  </div>
                ) : null}
              </Card>
            ),
          },
          {
            id: 'preferences',
            label: 'Work preferences',
            content: (
              <Card>
                <div className="stack">
                  <ChoiceChips<ProfessionalOrientation>
                    legend="Professional orientation"
                    value={p.orientation}
                    onChange={(v) => set('orientation', v as ProfessionalOrientation)}
                    options={[
                      { value: 'employee', label: 'Employee' },
                      { value: 'freelancer', label: 'Freelancer' },
                      { value: 'entrepreneur', label: 'Entrepreneur' },
                      { value: 'student', label: 'Student / Graduate' },
                      { value: 'open', label: 'Open to opportunities' },
                    ]}
                  />
                  <TextField
                    label="Desired roles (comma separated)"
                    value={p.preferences.desiredRoles.join(', ')}
                    onChange={(e) => set('preferences', { ...p.preferences, desiredRoles: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                  />
                  <TextField
                    label="Preferred locations (comma separated)"
                    value={p.preferences.locations.join(', ')}
                    onChange={(e) => set('preferences', { ...p.preferences, locations: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                  />
                  <TextField
                    label="Minimum monthly salary (NGN)"
                    type="number"
                    min={0}
                    step={10000}
                    value={p.preferences.minSalary}
                    onChange={(e) => set('preferences', { ...p.preferences, minSalary: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
