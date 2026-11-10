'use client';

import { useState } from 'react';
import { formatDateTime, type CandidateProfile, type EducationEntry, type ExperienceEntry } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Badge, Button, Card, MockNotice, PageHeader } from '@/components/ui/primitives';
import { TextArea, TextField } from '@/components/ui/form';

const newId = (p: string) => `${p}-${Date.now().toString(36)}`;

export default function CvPage() {
  const saved = useDemoStore((s) => s.candidate);
  const [exp, setExp] = useState<ExperienceEntry[]>(saved.experience);
  const [edu, setEdu] = useState<EducationEntry[]>(saved.education);
  const [certs, setCerts] = useState(saved.certifications.join(', '));
  const [summary, setSummary] = useState(saved.summary);
  const save = useAction((patch: Partial<CandidateProfile>) => getService().candidate.updateProfile(patch), { success: 'CV saved' });
  const attach = useAction((m: { name: string; sizeKb: number }) => getService().candidate.attachCv(m), {
    success: (r) => (r.xp.award ? `CV attached · +${r.xp.award} XP` : 'CV replaced'),
  });
  const remove = useAction(() => getService().candidate.removeCv(), { success: 'CV removed' });
  const [fileError, setFileError] = useState<string | null>(null);
  const invalid = exp.some((e) => !e.title.trim() || !e.company.trim()) || edu.some((e) => !e.school.trim());

  return (
    <>
      <PageHeader
        title="CV"
        description="Build a structured CV employers can read consistently. Print or save as PDF from the preview."
        actions={
          <>
            <Button onClick={() => window.print()}>Print / save PDF</Button>
            <Button
              variant="primary"
              pending={save.pending}
              disabled={invalid}
              onClick={() =>
                save.run({
                  experience: exp,
                  education: edu,
                  summary,
                  certifications: certs.split(',').map((c) => c.trim()).filter(Boolean),
                })
              }
            >
              Save CV
            </Button>
          </>
        }
      />
      <div className="grid-2">
        <div className="stack">
          <Card title="CV file">
            <MockNotice title="Local only">Only the file name and size are recorded. The file is not read, uploaded or parsed.</MockNotice>
            {saved.cvFile ? (
              <div className="row-between" style={{ marginTop: 10 }}>
                <span>
                  📄 {saved.cvFile.name} <span className="small muted">({saved.cvFile.sizeKb} KB · {formatDateTime(saved.cvFile.addedAt)})</span>
                </span>
                <Button size="sm" variant="danger" onClick={() => remove.run()}>
                  Remove
                </Button>
              </div>
            ) : null}
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="cv-upload">{saved.cvFile ? 'Replace CV' : 'Attach CV'}</label>
              <input
                id="cv-upload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFileError(null);
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) return setFileError('Files must be under 5 MB.');
                  void attach.run({ name: f.name, sizeKb: Math.round(f.size / 1024) });
                }}
              />
              {fileError ? <span className="error" role="alert">{fileError}</span> : null}
            </div>
          </Card>
          <Card title="Summary">
            <TextArea label="Professional summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={800} />
          </Card>
          <Card title="Experience" actions={<Button size="sm" onClick={() => setExp((l) => [...l, { id: newId('exp'), title: '', company: '', start: '', end: null, summary: '' }])}>+ Add role</Button>}>
            <div className="stack">
              {exp.map((e, i) => (
                <fieldset key={e.id} className="card stack" style={{ boxShadow: 'none' }}>
                  <legend className="sr-only">Role {i + 1}</legend>
                  <div className="grid-2">
                    <TextField label="Job title" value={e.title} onChange={(ev) => setExp((l) => l.map((x) => (x.id === e.id ? { ...x, title: ev.target.value } : x)))} error={!e.title.trim() ? 'Required' : null} />
                    <TextField label="Company" value={e.company} onChange={(ev) => setExp((l) => l.map((x) => (x.id === e.id ? { ...x, company: ev.target.value } : x)))} error={!e.company.trim() ? 'Required' : null} />
                    <TextField label="Start (YYYY-MM)" value={e.start} onChange={(ev) => setExp((l) => l.map((x) => (x.id === e.id ? { ...x, start: ev.target.value } : x)))} />
                    <TextField label="End (blank = current)" value={e.end ?? ''} onChange={(ev) => setExp((l) => l.map((x) => (x.id === e.id ? { ...x, end: ev.target.value || null } : x)))} />
                  </div>
                  <TextArea label="Achievements" value={e.summary} onChange={(ev) => setExp((l) => l.map((x) => (x.id === e.id ? { ...x, summary: ev.target.value } : x)))} hint="Use numbers where you can." />
                  <div>
                    <Button size="sm" variant="danger" onClick={() => setExp((l) => l.filter((x) => x.id !== e.id))}>
                      Remove role
                    </Button>
                  </div>
                </fieldset>
              ))}
            </div>
          </Card>
          <Card title="Education & certifications" actions={<Button size="sm" onClick={() => setEdu((l) => [...l, { id: newId('edu'), school: '', qualification: '', year: '' }])}>+ Add education</Button>}>
            <div className="stack">
              {edu.map((e) => (
                <div key={e.id} className="grid" style={{ ['--min' as string]: '150px', alignItems: 'end' }}>
                  <TextField label="School" value={e.school} onChange={(ev) => setEdu((l) => l.map((x) => (x.id === e.id ? { ...x, school: ev.target.value } : x)))} />
                  <TextField label="Qualification" value={e.qualification} onChange={(ev) => setEdu((l) => l.map((x) => (x.id === e.id ? { ...x, qualification: ev.target.value } : x)))} />
                  <TextField label="Year" value={e.year} onChange={(ev) => setEdu((l) => l.map((x) => (x.id === e.id ? { ...x, year: ev.target.value } : x)))} />
                  <Button size="sm" variant="danger" onClick={() => setEdu((l) => l.filter((x) => x.id !== e.id))}>
                    Remove
                  </Button>
                </div>
              ))}
              <TextField label="Certifications (comma separated)" value={certs} onChange={(e) => setCerts(e.target.value)} />
            </div>
          </Card>
        </div>
        <Card title="Preview" aria-label="CV preview">
          <article className="stack" style={{ ['--gap' as string]: '10px' }}>
            <header>
              <h2>{saved.displayName}</h2>
              <p className="muted">
                {saved.headline} · {saved.location}
              </p>
            </header>
            <p>{summary}</p>
            <h3>Skills</h3>
            <div className="row">{saved.skills.map((s) => <Badge key={s.name}>{s.name}</Badge>)}</div>
            <h3>Experience</h3>
            {exp.map((e) => (
              <div key={e.id}>
                <strong>
                  {e.title || 'Untitled role'} — {e.company}
                </strong>
                <p className="small muted">
                  {e.start} – {e.end ?? 'present'}
                </p>
                <p className="small">{e.summary}</p>
              </div>
            ))}
            <h3>Education</h3>
            {edu.map((e) => (
              <p key={e.id} className="small">
                {e.qualification}, {e.school} ({e.year})
              </p>
            ))}
            {certs.trim() ? (
              <>
                <h3>Certifications</h3>
                <p className="small">{certs}</p>
              </>
            ) : null}
          </article>
        </Card>
      </div>
    </>
  );
}
