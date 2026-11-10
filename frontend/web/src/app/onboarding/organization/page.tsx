'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DISTRICTS,
  MODULE_LABELS,
  ROLE_LABELS,
  DEFAULT_TIER_MODULES,
  getPersona,
  type DistrictId,
  type OrgRole,
  type Policy,
  type SubscriptionTier,
  type WorkMode,
} from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import type { OrganizationInput } from '@/lib/services/contracts';
import { useAction } from '@/lib/hooks/use-action';
import { Wizard } from '@/components/wizard';
import { ChoiceChips, SelectField, TextArea, TextField } from '@/components/ui/form';
import { Badge, Button, InfoNotice, LinkButton, MockNotice } from '@/components/ui/primitives';
import { OrgLogo } from '@/components/ui/avatar';
import { EnterCityButton } from '@/components/enter-city-button';

const ASSIGNABLE: OrgRole[] = ['hr-manager', 'recruiter', 'payroll-officer', 'manager', 'employee', 'org-admin'];
const POLICY_TEMPLATES: OrganizationInput['policies'] = [
  { title: 'Leave & time off', category: 'leave', body: 'Describe annual, sick and parental leave entitlements and how to request leave.' },
  { title: 'Code of conduct', category: 'conduct', body: 'Expected behaviour, respect, anti-harassment and how to raise concerns.' },
  { title: 'Hybrid & remote work', category: 'remote-work', body: 'Onsite expectations, core hours and equipment.' },
];
const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0f766e', '#334155'];

const blankProfile: OrganizationInput['profile'] = {
  name: '',
  tagline: '',
  logoColor: COLORS[0]!,
  logoGlyph: '',
  industry: '',
  description: '',
  website: '',
  size: '1-10',
  structure: '',
  workArrangements: ['hybrid'],
  values: [],
  culture: { environment: '', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' },
  benefits: [],
  headquarters: '',
  district: 'corporate',
};

const split = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export default function OrganizationOnboardingPage() {
  const personaId = useDemoStore((s) => s.session?.personaId);
  const [profile, setProfile] = useState(blankProfile);
  const [locations, setLocations] = useState<OrganizationInput['locations']>([{ name: 'Head office', city: 'Grooveli City', address: '', headcountCapacity: 50 }]);
  const [departments, setDepartments] = useState<OrganizationInput['departments']>([
    { name: 'Operations', responsibilities: '' },
    { name: 'People', responsibilities: 'HR, recruitment and payroll' },
  ]);
  const [policies, setPolicies] = useState<OrganizationInput['policies']>(POLICY_TEMPLATES.slice(0, 2));
  const [invites, setInvites] = useState<OrganizationInput['invites']>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [tier, setTier] = useState<SubscriptionTier>('growth');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const create = useAction((input: OrganizationInput) => getService().organizations.create(input), { success: 'Organisation created (demo)' });
  const setP = <K extends keyof typeof profile>(k: K, v: (typeof profile)[K]) => setProfile((p) => ({ ...p, [k]: v }));
  const setCulture = (k: keyof typeof profile.culture, v: string) => setProfile((p) => ({ ...p, culture: { ...p.culture, [k]: v } }));

  if (personaId && personaId !== 'org-admin') {
    return (
      <InfoNotice>
        Only a founding organisation administrator can create an organisation. Current persona: {getPersona(personaId)?.label}.{' '}
        <Link href="/login?switch=1">Switch persona</Link>.
      </InfoNotice>
    );
  }

  if (createdId) {
    return (
      <section className="card stack" aria-labelledby="org-done" style={{ ['--gap' as string]: '14px' }}>
        <div className="row">
          <OrgLogo glyph={profile.logoGlyph || profile.name[0] || '?'} color={profile.logoColor} name={profile.name} size={56} />
          <h1 id="org-done">{profile.name} is ready</h1>
        </div>
        <p className="muted">You are the founding administrator. Invitations are pending (simulated — no emails were sent).</p>
        <div className="row">
          <LinkButton href="/org" variant="primary">
            Open the organisation workspace
          </LinkButton>
          <LinkButton href="/org/recruitment/vacancies/new">Publish your first vacancy</LinkButton>
          <EnterCityButton district={profile.district} organizationId={createdId} label="Preview virtual HQ" />
        </div>
        <InfoNotice>
          Organisations created in the web app appear in the city as public-safe projections when the city is opened through the same origin (
          <code>/city</code>). On a separate origin the city shows fixture organisations only.
        </InfoNotice>
      </section>
    );
  }

  const policyRow = (p: OrganizationInput['policies'][number], i: number) => (
    <div key={i} className="card stack" style={{ boxShadow: 'none' }}>
      <div className="grid-2">
        <TextField label="Policy title" value={p.title} onChange={(e) => setPolicies((list) => list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
        <SelectField
          label="Category"
          value={p.category}
          onChange={(e) => setPolicies((list) => list.map((x, j) => (j === i ? { ...x, category: e.target.value as Policy['category'] } : x)))}
          options={['leave', 'conduct', 'remote-work', 'benefits', 'security', 'other'].map((c) => ({ value: c, label: c }))}
        />
      </div>
      <TextArea label="Summary" value={p.body} onChange={(e) => setPolicies((list) => list.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
      <div>
        <Button size="sm" variant="danger" onClick={() => setPolicies((list) => list.filter((_, j) => j !== i))}>
          Remove policy
        </Button>
      </div>
    </div>
  );

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <header>
        <h1>Set up your organisation</h1>
        <p className="muted">Establish your company as a recognisable place in Grooveli City and a collaborative workspace for your team.</p>
      </header>
      <MockNotice title="Demo workspace">Organisation data stays in this browser. Verification, billing and email invitations are not performed.</MockNotice>
      <Wizard
        label="Organisation onboarding"
        finishLabel="Create organisation"
        pending={create.pending}
        onFinish={async () => {
          const res = await create.run({ profile: { ...profile, logoGlyph: (profile.logoGlyph || profile.name[0] || 'O').toUpperCase() }, locations, departments, policies, invites, tier });
          if (res) setCreatedId(res.organizationId);
        }}
        steps={[
          {
            id: 'company',
            title: 'Company',
            validate: () => (profile.name.trim().length < 2 ? 'Enter the organisation name.' : !profile.industry.trim() ? 'Enter an industry.' : null),
            content: (
              <div className="stack">
                <div className="grid-2">
                  <TextField label="Organisation name" value={profile.name} onChange={(e) => setP('name', e.target.value)} required maxLength={80} />
                  <TextField label="Tagline" value={profile.tagline} onChange={(e) => setP('tagline', e.target.value)} maxLength={80} />
                  <TextField label="Industry / business category" value={profile.industry} onChange={(e) => setP('industry', e.target.value)} required />
                  <TextField label="Website" value={profile.website} onChange={(e) => setP('website', e.target.value)} placeholder="https://" />
                  <SelectField
                    label="Company size"
                    value={profile.size}
                    onChange={(e) => setP('size', e.target.value as typeof profile.size)}
                    options={['1-10', '11-50', '51-200', '201-1000', '1000+'].map((v) => ({ value: v, label: `${v} people` }))}
                  />
                  <TextField label="Business structure" value={profile.structure} onChange={(e) => setP('structure', e.target.value)} placeholder="e.g. Private limited company" />
                  <TextField label="Headquarters address" value={profile.headquarters} onChange={(e) => setP('headquarters', e.target.value)} />
                  <SelectField
                    label="City district for your virtual HQ"
                    value={profile.district ?? 'corporate'}
                    onChange={(e) => setP('district', e.target.value as DistrictId)}
                    options={DISTRICTS.filter((d) => d.industries.length).map((d) => ({ value: d.id, label: d.name }))}
                  />
                </div>
                <TextArea label="Company description" value={profile.description} onChange={(e) => setP('description', e.target.value)} maxLength={600} />
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <TextField label="Logo letter" value={profile.logoGlyph} onChange={(e) => setP('logoGlyph', e.target.value.slice(0, 1).toUpperCase())} maxLength={1} style={{ width: 80 }} />
                  <fieldset className="field">
                    <legend>Logo colour</legend>
                    <div className="chips">
                      {COLORS.map((c) => (
                        <label key={c} className="chip">
                          <input type="radio" name="logo-color" checked={profile.logoColor === c} onChange={() => setP('logoColor', c)} aria-label={`Colour ${c}`} />
                          <span className="swatch" style={{ background: c, padding: 0, minHeight: 32 }} />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <OrgLogo glyph={profile.logoGlyph || profile.name[0] || '?'} color={profile.logoColor} name={profile.name || 'Preview'} size={48} />
                </div>
              </div>
            ),
          },
          {
            id: 'culture',
            title: 'Culture & values',
            description: 'Help candidates understand what it feels like to work with you — beyond salary.',
            validate: () => (profile.values.length === 0 ? 'Add at least one company value.' : null),
            content: (
              <div className="stack">
                <TextField label="Company values" hint="Comma separated" value={profile.values.join(', ')} onChange={(e) => setP('values', split(e.target.value))} />
                <ChoiceChips<WorkMode>
                  legend="Working arrangements"
                  multiple
                  value={profile.workArrangements}
                  onChange={(v) => setP('workArrangements', v as WorkMode[])}
                  options={[
                    { value: 'remote', label: 'Remote' },
                    { value: 'hybrid', label: 'Hybrid' },
                    { value: 'onsite', label: 'Onsite' },
                  ]}
                />
                <div className="grid-2">
                  <TextArea label="Workplace environment & culture" value={profile.culture.environment} onChange={(e) => setCulture('environment', e.target.value)} />
                  <TextArea label="Leadership & management style" value={profile.culture.leadership} onChange={(e) => setCulture('leadership', e.target.value)} />
                  <TextArea label="Team collaboration" value={profile.culture.collaboration} onChange={(e) => setCulture('collaboration', e.target.value)} />
                  <TextArea label="Employee development" value={profile.culture.development} onChange={(e) => setCulture('development', e.target.value)} />
                  <TextArea label="Diversity & inclusion commitments" value={profile.culture.inclusion} onChange={(e) => setCulture('inclusion', e.target.value)} />
                  <TextArea label="Work-life balance" value={profile.culture.workLife} onChange={(e) => setCulture('workLife', e.target.value)} />
                </div>
                <TextField label="Employee benefits" hint="Comma separated" value={profile.benefits.join(', ')} onChange={(e) => setP('benefits', split(e.target.value))} />
              </div>
            ),
          },
          {
            id: 'policies',
            title: 'Workplace policies',
            optional: true,
            content: (
              <div className="stack">
                {policies.map(policyRow)}
                <div className="row">
                  {POLICY_TEMPLATES.filter((t) => !policies.some((p) => p.title === t.title)).map((t) => (
                    <Button key={t.title} size="sm" onClick={() => setPolicies((l) => [...l, t])}>
                      + {t.title} template
                    </Button>
                  ))}
                  <Button size="sm" onClick={() => setPolicies((l) => [...l, { title: '', category: 'other', body: '' }])}>
                    + Blank policy
                  </Button>
                </div>
              </div>
            ),
          },
          {
            id: 'locations',
            title: 'Locations',
            validate: () => (locations.length === 0 || locations.some((l) => !l.name.trim()) ? 'Each location needs a name.' : null),
            content: (
              <div className="stack">
                {locations.map((l, i) => (
                  <div key={i} className="grid" style={{ ['--min' as string]: '180px', alignItems: 'end' }}>
                    <TextField label="Location name" value={l.name} onChange={(e) => setLocations((ls) => ls.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <TextField label="City" value={l.city} onChange={(e) => setLocations((ls) => ls.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} />
                    <TextField label="Address" value={l.address} onChange={(e) => setLocations((ls) => ls.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))} />
                    <Button variant="danger" size="sm" onClick={() => setLocations((ls) => ls.filter((_, j) => j !== i))} disabled={locations.length === 1}>
                      Remove
                    </Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" onClick={() => setLocations((ls) => [...ls, { name: '', city: '', address: '', headcountCapacity: 20 }])}>
                    + Add location
                  </Button>
                </div>
              </div>
            ),
          },
          {
            id: 'team',
            title: 'Admin & invite team',
            optional: true,
            description: 'You become the founding administrator. Invite HR managers, recruiters and colleagues.',
            content: (
              <div className="stack">
                <div className="card row" style={{ boxShadow: 'none' }}>
                  <Badge tone="primary">Founding admin</Badge>
                  <span>{getPersona('org-admin')?.displayName} (you)</span>
                </div>
                <form
                  className="row"
                  style={{ alignItems: 'flex-end' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const email = inviteEmail.trim().toLowerCase();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || invites.some((i) => i.email === email)) return;
                    setInvites((l) => [...l, { email, roles: ['employee'] }]);
                    setInviteEmail('');
                  }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <TextField label="Invite by email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.example" />
                  </div>
                  <Button type="submit">Add invitation</Button>
                </form>
                {invites.length ? (
                  <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
                    {invites.map((inv) => (
                      <li key={inv.email} className="row-between">
                        <span>{inv.email}</span>
                        <Button size="sm" variant="ghost" onClick={() => setInvites((l) => l.filter((x) => x.email !== inv.email))}>
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">No invitations yet.</p>
                )}
              </div>
            ),
          },
          {
            id: 'departments',
            title: 'Departments',
            validate: () => (departments.some((d) => !d.name.trim()) ? 'Each department needs a name.' : null),
            content: (
              <div className="stack">
                {departments.map((d, i) => (
                  <div key={i} className="grid" style={{ ['--min' as string]: '220px', alignItems: 'end' }}>
                    <TextField label="Department" value={d.name} onChange={(e) => setDepartments((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <TextField
                      label="Responsibilities"
                      value={d.responsibilities}
                      onChange={(e) => setDepartments((l) => l.map((x, j) => (j === i ? { ...x, responsibilities: e.target.value } : x)))}
                    />
                    <Button variant="danger" size="sm" onClick={() => setDepartments((l) => l.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" onClick={() => setDepartments((l) => [...l, { name: '', responsibilities: '' }])}>
                    + Add department
                  </Button>
                </div>
              </div>
            ),
          },
          {
            id: 'roles',
            title: 'Assign roles',
            optional: true,
            description: 'Roles decide which modules each person sees. (UX only — the backend will enforce real permissions.)',
            validate: () => (invites.some((i) => i.roles.length === 0) ? 'Every invitation needs at least one role.' : null),
            content:
              invites.length === 0 ? (
                <p className="muted">No invitations to assign. You can invite people later from Members & roles.</p>
              ) : (
                <div className="stack">
                  {invites.map((inv) => (
                    <ChoiceChips<OrgRole>
                      key={inv.email}
                      legend={inv.email}
                      multiple
                      value={inv.roles}
                      onChange={(v) => setInvites((l) => l.map((x) => (x.email === inv.email ? { ...x, roles: v as OrgRole[] } : x)))}
                      options={ASSIGNABLE.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                    />
                  ))}
                </div>
              ),
          },
          {
            id: 'checklist',
            title: 'Plan & checklist',
            content: (
              <div className="stack">
                <ChoiceChips<SubscriptionTier>
                  legend="Plan (mock — pricing not defined)"
                  value={tier}
                  onChange={(v) => setTier(v as SubscriptionTier)}
                  options={(['starter', 'growth', 'enterprise'] as SubscriptionTier[]).map((t) => ({ value: t, label: t[0]!.toUpperCase() + t.slice(1) }))}
                />
                <p className="small muted">Includes: {DEFAULT_TIER_MODULES[tier].map((m) => MODULE_LABELS[m]).join(' · ')}</p>
                <ul className="stack" style={{ listStyle: 'none', padding: 0, ['--gap' as string]: '6px' }} aria-label="Setup checklist">
                  {[
                    ['Company profile', profile.name.trim().length > 1],
                    ['Culture & values', profile.values.length > 0],
                    ['Workplace policies', policies.length > 0],
                    ['Locations', locations.length > 0],
                    ['Team invited', invites.length > 0],
                    ['Departments', departments.length > 0],
                    ['Roles assigned', invites.length > 0 && invites.every((i) => i.roles.length > 0)],
                    ['First vacancy (after creation)', false],
                  ].map(([label, ok]) => (
                    <li key={label as string}>
                      <span aria-hidden="true">{ok ? '✅' : '⬜'}</span> {label as string}
                      <span className="sr-only">{ok ? ' — done' : ' — to do'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
