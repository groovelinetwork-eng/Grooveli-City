import { useState, type ReactNode } from 'react';
import { DISTRICTS, PUBLIC_TOP_JOBS, SKILL_CHALLENGES, formatDate, formatDateTime, getDistrict, type CityEvent, type CityIntent, type DistrictId, type OrgArea, type PresenceProjection, type PublicHqProjection } from '@grooveli/frontend-domain/public';
import { webHref, type CitySettings } from '../app/settings';
import { cityConfig } from '../app/config';
import { stationIntent, stationsFor, type InteriorKind, type Station } from '../app/interiors';
import type { CityIdentity } from '../services/identity';
import { eventsIn, type WorldData } from '../services/world-data';
import { PLACED_BUILDINGS, type Interactable } from '../world/layout';
import { Panel, SimTag, WebLink } from './Panel';

export function DistrictPanel({ district, data, onClose, onEnter }: { district: DistrictId; data: WorldData; onClose: () => void; onEnter: (buildingId: string) => void }) {
  const d = getDistrict(district);
  const events = eventsIn(data, district);
  const buildings = PLACED_BUILDINGS.filter((b) => b.district === district && b.enterable);
  const jobs = data.jobCounts[district] ?? 0;
  return (
    <Panel title={d.name} subtitle={d.tagline} onClose={onClose}>
      <p>{d.description}</p>
      {d.industries.length ? <p className="muted small">{d.industries.join(' · ')}</p> : null}
      {d.industries.length ? <p className="small">{jobs} open roles in this district (synthetic)</p> : null}
      <div className="btn-col">
        {d.actions.map((a) => (
          <WebLink key={a.label} href={webHref(a.intent, district)} primary>
            {a.label}
          </WebLink>
        ))}
      </div>
      {buildings.length ? (
        <>
          <h3>Buildings you can enter</h3>
          <div className="btn-col">
            {buildings.map((b) => (
              <button key={b.id} type="button" className="city-btn" onClick={() => onEnter(b.id)}>
                🚪 {b.name}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {events.length ? (
        <>
          <h3>Events here</h3>
          <ul className="list">
            {events.map((e) => (
              <li key={e.id}>
                <a href={webHref({ type: 'viewEvent', eventId: e.id }, district)}>{e.title}</a>
                <span className="muted small"> · {formatDateTime(e.start)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}

export function BuildingPanel({ target, hq, onClose, onEnter }: { target: Extract<Interactable, { kind: 'building' }>; hq: PublicHqProjection | null; onClose: () => void; onEnter: () => void }) {
  const b = target.building;
  return (
    <Panel title={b.name} subtitle={hq ? hq.organization.tagline : getDistrict(b.district).name} onClose={onClose}>
      {hq ? (
        <>
          <p>{hq.organization.description}</p>
          <p className="small">
            {hq.vacancies.length} open roles · {hq.organization.industry} {hq.organization.verified ? '· verified (demo)' : '· unverified'}
          </p>
        </>
      ) : b.district === 'apartment' ? (
        <p>Your personal career headquarters: desk, laptop, CV folder, trophy shelf, stats wall and phone.</p>
      ) : (
        <p>Your career companion lives here — guidance, job discovery, CV help and interview practice.</p>
      )}
      <div className="btn-col">
        <button type="button" className="city-btn city-btn-primary" onClick={onEnter}>
          🚪 Enter {hq ? 'headquarters' : ''}
        </button>
        {hq ? <WebLink href={webHref({ type: 'viewOrganization', organizationId: hq.organization.id }, b.district)}>Company profile</WebLink> : null}
      </div>
    </Panel>
  );
}

type Audience = 'Visitors & candidates' | 'Employees' | 'Recruiters & HR' | 'Administrators';

/** Links grouped by who they are for. A UX hint only: the web workspace (and backend) decides access. */
function AudienceLinks({ groups, district }: { groups: [Audience, [string, CityIntent][]][]; district: DistrictId }) {
  return (
    <div className="audience-groups">
      {groups.map(([who, links]) => (
        <section key={who} aria-label={who}>
          <h3>{who}</h3>
          <div className="btn-col">
            {links.map(([label, intent]) => (
              <WebLink key={label} href={webHref(intent, district)}>
                {label}
              </WebLink>
            ))}
          </div>
        </section>
      ))}
      {groups.some(([who]) => who !== 'Visitors & candidates') ? (
        <p className="small muted">Staff tools open in the Grooveli web workspace, which checks your membership and role. The city never loads private records.</p>
      ) : null}
    </div>
  );
}

function HqStationBody({ id, hq, onCheckIn, checkedIn }: { id: string; hq: PublicHqProjection; onCheckIn: () => void; checkedIn: boolean }) {
  const o = hq.organization;
  const district = o.district;
  const area = (a: OrgArea): CityIntent => ({ type: 'openOrgArea', organizationId: o.id, area: a });
  switch (id) {
    case 'reception':
      return (
        <>
          <p>{o.description}</p>
          <p className="small">
            {o.industry} · {o.size} people · {o.workArrangements.join(', ')} {o.verified ? '· verified (demo)' : '· unverified'}
          </p>
          {checkedIn ? (
            <p className="notice small" role="status">
              You&apos;re checked in as a visitor. <SimTag>demo — nothing is recorded or sent</SimTag>
            </p>
          ) : (
            <button type="button" className="city-btn city-btn-primary" onClick={onCheckIn}>
              Check in as a visitor
            </button>
          )}
        </>
      );
    case 'culture': {
      const rows: [string, string][] = [
        ['Environment', o.culture.environment],
        ['Leadership', o.culture.leadership],
        ['Collaboration', o.culture.collaboration],
        ['Development', o.culture.development],
        ['Inclusion', o.culture.inclusion],
        ['Work–life', o.culture.workLife],
      ];
      return (
        <>
          <p>
            <strong>{o.tagline}</strong>
          </p>
          <p className="small">
            <strong>Values:</strong> {o.values.join(' · ')}
          </p>
          <dl className="culture-list small">
            {rows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          <p className="small">
            <strong>Benefits:</strong> {o.benefits.length ? o.benefits.join(', ') : 'Not published.'}
          </p>
          <AudienceLinks district={district} groups={[['Employees', [['Culture & recognition', area('engagement-culture')]]]]} />
        </>
      );
    }
    case 'announcements':
      return hq.announcements.length ? (
        <ul className="list">
          {hq.announcements.map((a) => (
            <li key={a.id}>
              <strong>{a.title}</strong> <span className="muted small">{formatDate(a.publishedAt)}</span>
              <p className="small">{a.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No public announcements.</p>
      );
    case 'careers':
      return hq.vacancies.length ? (
        <ul className="list">
          {hq.vacancies.map((v) => (
            <li key={v.id}>
              <a href={webHref({ type: 'viewJob', jobId: v.id }, district)}>{v.title}</a>
              <span className="muted small">
                {' '}
                · {v.department} · {v.workMode} · {v.employmentType}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No open positions right now.</p>
      );
    case 'recruitment':
      return (
        <>
          <p>
            {hq.vacancies.length} open role{hq.vacancies.length === 1 ? '' : 's'}. Applications are submitted and tracked in the Grooveli web app.
          </p>
          <AudienceLinks
            district={district}
            groups={[
              ['Visitors & candidates', [['My applications', { type: 'openApplications' }]]],
              [
                'Recruiters & HR',
                [
                  ['Hiring pipeline', area('recruitment-pipeline')],
                  ['Recruitment analytics', area('recruitment-analytics')],
                ],
              ],
            ]}
          />
        </>
      );
    case 'interview':
      return (
        <>
          <p>Interviews are scheduled and joined from the Grooveli web app. Interview practice lives in the AI Career Center.</p>
          <AudienceLinks
            district={district}
            groups={[
              ['Recruiters & HR', [['Interview schedule', area('recruitment-interviews')]]],
            ]}
          />
        </>
      );
    case 'meeting':
      return (
        <>
          <p>Company events and team activities. Video calls aren&apos;t available inside the city.</p>
          <AudienceLinks district={district} groups={[['Employees', [['Team activities', area('engagement-activities')]]]]} />
        </>
      );
    case 'directory':
      return (
        <>
          <p className="small muted">Only colleagues who opted in are listed. Contact details are never shown in the city.</p>
          {hq.directory.length ? (
            <ul className="list">
              {hq.directory.map((d) => (
                <li key={d.name}>
                  {d.name} <span className="muted small">— {d.title}, {d.department}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nobody has opted in to the public directory yet.</p>
          )}
          <AudienceLinks
            district={district}
            groups={[
              [
                'Employees',
                [
                  ['People directory', area('people')],
                  ['Organisation structure', area('structure')],
                ],
              ],
            ]}
          />
        </>
      );
    case 'departments': {
      const counts = new Map<string, number>();
      for (const d of hq.directory) counts.set(d.department, (counts.get(d.department) ?? 0) + 1);
      return (
        <>
          {hq.departments.length ? (
            <ul className="list">
              {hq.departments.map((d) => (
                <li key={d}>
                  {d}
                  {counts.get(d) ? <span className="muted small"> · {counts.get(d)} listed publicly</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>Department details are private.</p>
          )}
          <AudienceLinks district={district} groups={[['Employees', [['People directory', area('people')]]]]} />
        </>
      );
    }
    case 'hr':
      return (
        <>
          <p>Employee services: onboarding, leave, attendance, documents and policies. No HR data is loaded in the city.</p>
          <AudienceLinks
            district={district}
            groups={[
              [
                'Employees',
                [
                  ['Leave', area('hr-leave')],
                  ['Attendance', area('hr-attendance')],
                  ['My documents', area('hr-documents')],
                  ['Policies', area('hr-policies')],
                ],
              ],
              [
                'Recruiters & HR',
                [
                  ['Onboarding & lifecycle', area('hr-lifecycle')],
                  ['Performance', area('hr-performance')],
                ],
              ],
            ]}
          />
        </>
      );
    case 'records':
      return (
        <>
          <p>Secure employee records. Nothing is visible from here; HR managers open records in the web workspace.</p>
          <AudienceLinks
            district={district}
            groups={[
              ['Recruiters & HR', [['HR documents', area('hr-documents')]]],
            ]}
          />
        </>
      );
    case 'lounge':
      return (
        <>
          {o.culture.workLife ? <p className="small">{o.culture.workLife}</p> : null}
          <AudienceLinks
            district={district}
            groups={[
              [
                'Employees',
                [
                  ['Recognition', area('engagement-recognition')],
                  ['Activities', area('engagement-activities')],
                ],
              ],
            ]}
          />
        </>
      );
    case 'management':
      return (
        <>
          <p>Management suite: the entry point to workforce tools. Figures are only shown after a permitted member signs in on the web.</p>
          <AudienceLinks
            district={district}
            groups={[
              [
                'Administrators',
                [
                  ['Workforce analytics', area('analytics')],
                  ['Payroll & compensation (preview)', area('payroll')],
                  ['Performance', area('hr-performance')],
                  ['Recruitment analytics', area('recruitment-analytics')],
                  ['Organisation settings', area('settings')],
                ],
              ],
            ]}
          />
        </>
      );
    default:
      return (
        <>
          <p>
            Internal workplace tools (HR, leave, payroll previews, team spaces) live in the Grooveli web workspace. Access is checked there — the city never
            loads employee records.
          </p>
          <AudienceLinks
            district={district}
            groups={[
              [
                'Employees',
                [
                  ['Leave', area('hr-leave')],
                  ['Attendance', area('hr-attendance')],
                ],
              ],
            ]}
          />
        </>
      );
  }
}

const HQ_PRIMARY_LABEL: Record<string, string> = {
  employees: 'Open employee workspace',
  careers: 'Browse all jobs',
  recruitment: 'Recruitment workspace',
  interview: 'My applications & interviews',
  meeting: 'Company events',
  departments: 'Organisation structure',
  hr: 'Employee self-service',
  records: 'Employee records',
  lounge: 'Engagement hub',
  management: 'Organisation overview',
};

const AI_PRIMARY_LABEL: Record<string, string> = {
  assistant: 'Open the career assistant',
  reception: 'Open the AI Career Center',
  guidance: 'Start career guidance',
  cv: 'Open CV & profile',
  jobs: 'Browse matched jobs',
  learning: 'Open learning',
  assessment: 'Open skills',
  matching: 'Browse opportunities',
  interview: 'Interviews & practice',
  pathway: 'Plan with skills',
};

/** AI Career Center station content. No AI output is generated in the city; the web assistant is a labelled rule-based demo. */
function AiStationBody({ id, identity }: { id: string; identity: CityIdentity }) {
  const first = identity.displayName.split(' ')[0];
  const guest = identity.source === 'guest';
  const more = (links: [string, CityIntent][]) => (
    <div className="btn-col">
      {links.map(([label, intent]) => (
        <WebLink key={label} href={webHref(intent, 'ai-center')}>
          {label}
        </WebLink>
      ))}
    </div>
  );
  switch (id) {
    case 'assistant':
      return (
        <>
          <p>
            GROOVELI ASSISTANT — Welcome{guest ? '' : ` back, ${first}`}. Ask about roles, your CV, skills or deadlines; your matches, applications, interviews and
            recommended missions are waiting in the Career Center. <SimTag>rule-based, no AI</SimTag>
          </p>
          {more([
            ['My applications', { type: 'openApplications' }],
            ['Missions', { type: 'openMissions' }],
          ])}
        </>
      );
    case 'reception':
      return (
        <>
          <p>
            Welcome to the AI Career Center. Talk to the career assistant at the core, book time in a consultation pod, build skills in the lab, rehearse in the
            interview chamber and explore career pathways.
          </p>
          <p className="small muted">The assistant is a rule-based demo in the Grooveli web app — it is not a live AI service.</p>
        </>
      );
    case 'guidance':
      return (
        <>
          <p>Personal career guidance: explore roles, set goals and ask the assistant what to do next. The session opens in Grooveli web.</p>
          <p className="small muted">Guidance comes from the web app&apos;s rule-based engine. <SimTag>no live AI</SimTag></p>
          {more([['Missions & goals', { type: 'openMissions' }]])}
        </>
      );
    case 'cv':
      return (
        <>
          <p>Improve your CV and profile: structure, skills and evidence. Edits are made and saved in Grooveli web.</p>
          {more([
            ['My profile', { type: 'openProfile' }],
            ['Skills', { type: 'openSkills' }],
          ])}
        </>
      );
    case 'jobs':
      return (
        <>
          <p>Job-search help: roles matched to your skills, your applications and upcoming deadlines.</p>
          {more([['My applications', { type: 'openApplications' }]])}
        </>
      );
    case 'learning':
      return (
        <>
          <p>Training terminals: courses and learning pathways from Foundations to Certification.</p>
          {more([['Skill challenges', { type: 'openSkills' }]])}
        </>
      );
    case 'assessment':
      return (
        <>
          <p>Skills assessment: take a skill challenge and see where you stand. Questions, scoring and results live in Grooveli web.</p>
          <p className="small">Challenges: {SKILL_CHALLENGES.map((c) => c.skill).join(', ')}.</p>
          {more([['Learning', { type: 'openLearning' }]])}
        </>
      );
    case 'matching':
      return (
        <>
          <p>Career intelligence: open opportunities, roles by district, missions, skill challenges and — when you&apos;re signed in — your level.</p>
          <ul className="list">
            {PUBLIC_TOP_JOBS.slice(0, 5).map((j) => (
              <li key={j.id}>
                <a href={webHref({ type: 'viewJob', jobId: j.id }, 'ai-center')}>{j.title}</a>
                <span className="muted small"> · {getDistrict(j.district).name} · {j.workMode}</span>
              </li>
            ))}
          </ul>
          {more([
            ['Achievements', { type: 'openAchievements' }],
            ['My dashboard', { type: 'openDashboard' }],
          ])}
        </>
      );
    case 'interview':
      return (
        <>
          <p>Interview practice chamber: rehearse structured questions and review yourself against a checklist. Scheduled interviews and practice live in Grooveli web.</p>
          <p className="small muted">The camera here is decorative — nothing is recorded. Practice in the web app is rule-based, not live AI.</p>
          {more([['Practise in Missions', { type: 'openMissions' }]])}
        </>
      );
    case 'pathway':
      return (
        <>
          <p>Career pathway map: explore industries and the skills that lead into them, then plan your next steps.</p>
          {more([
            ['Missions', { type: 'openMissions' }],
            ['Learning', { type: 'openLearning' }],
          ])}
        </>
      );
    default:
      return <p>Open this experience in the Grooveli web app.</p>;
  }
}

export function StationPanel({ kind, station, hq, identity, onClose }: { kind: InteriorKind; station: Station; hq: PublicHqProjection | null; identity: CityIdentity; onClose: () => void }) {
  const intent = stationIntent(kind, station.id, hq);
  const [checkedIn, setCheckedIn] = useState(false);
  const district: DistrictId = kind === 'hq' ? hq?.organization.district ?? 'corporate' : kind === 'apartment' ? 'apartment' : 'ai-center';
  const guest = identity.source === 'guest';
  return (
    <Panel title={`${station.icon} ${station.label}`} subtitle={kind === 'hq' ? hq?.organization.name : getDistrict(district).name} onClose={onClose}>
      {kind === 'hq' && hq ? <HqStationBody id={station.id} hq={hq} checkedIn={checkedIn} onCheckIn={() => setCheckedIn(true)} /> : null}
      {kind === 'apartment' ? (
        <p>
          {station.id === 'stats' || station.id === 'desk'
            ? identity.level
              ? `${identity.displayName} · Career level ${identity.level}. Full stats, skills and certifications are on your web dashboard.`
              : 'Your career stats live on your web dashboard.'
            : station.id === 'laptop'
              ? 'Browse the same job marketplace you can search on the web.'
              : station.id === 'cv'
                ? 'View and edit your CV.'
                : station.id === 'trophies'
                  ? 'See your achievements and career milestones.'
                  : 'Check notifications about applications, interviews and missions.'}
        </p>
      ) : null}
      {kind === 'ai-center' ? <AiStationBody id={station.id} identity={identity} /> : null}
      {guest && kind !== 'hq' ? <p className="small muted">You&apos;re exploring as a guest — you&apos;ll be asked to sign in on the web.</p> : null}
      <div className="btn-col">
        <WebLink href={webHref(intent, district)} primary>
          {kind === 'hq' ? (HQ_PRIMARY_LABEL[station.id] ?? 'Company profile') : kind === 'ai-center' ? (AI_PRIMARY_LABEL[station.id] ?? 'Open in Grooveli web') : 'Open in Grooveli web'}
        </WebLink>
      </div>
    </Panel>
  );
}

export function StationList({ kind, onPick }: { kind: InteriorKind; onPick: (s: Station) => void }) {
  return (
    <ul className="station-list" aria-label="Things in this room">
      {stationsFor(kind).map((s) => (
        <li key={s.id}>
          <button type="button" className="city-btn station-btn" onClick={() => onPick(s)} aria-label={s.label} title={s.label}>
            <span aria-hidden="true">{s.icon}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PlacesPanel({ onClose, onTravel }: { onClose: () => void; onTravel: (d: DistrictId) => void }) {
  return (
    <Panel title="Places" subtitle="Travel instantly — keyboard friendly" onClose={onClose}>
      <ul className="list">
        {DISTRICTS.map((d) => (
          <li key={d.id}>
            <button type="button" className="city-btn" onClick={() => onTravel(d.id)} style={{ borderLeft: `4px solid ${d.color}` }}>
              {d.name}
              <span className="muted small"> — {d.tagline}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="small">
        Prefer no 3D? <a href={`${cityConfig.webUrl}/city-directory`}>Open the accessible city directory</a>.
      </p>
    </Panel>
  );
}

export function PeoplePanel({ people, onClose }: { people: PresenceProjection[]; onClose: () => void }) {
  return (
    <Panel title="People nearby" subtitle={<SimTag>Simulated presence — not live players</SimTag>} onClose={onClose}>
      <p className="small muted">
        Live multiplayer needs a realtime backend that doesn&apos;t exist yet. These people are generated locally so you can preview what a busy city feels
        like.
      </p>
      <ul className="list">
        {people.map((p) => (
          <li key={p.id}>
            {p.displayName} <span className="muted small">· {getDistrict(p.district).name} · {p.status}</span> <SimTag>SIM</SimTag>
          </li>
        ))}
      </ul>
      <div className="btn-col">
        <WebLink href={webHref({ type: 'openSocial' })}>Events & communities</WebLink>
        <WebLink href={webHref({ type: 'openPrivacy' })}>My visibility & privacy</WebLink>
      </div>
    </Panel>
  );
}

export function SettingsPanel({ settings, onChange, onClose, onDirectory }: { settings: CitySettings; onChange: (s: CitySettings) => void; onClose: () => void; onDirectory: () => void }) {
  const set = <K extends keyof CitySettings>(k: K, v: CitySettings[K]) => onChange({ ...settings, [k]: v });
  return (
    <Panel title="Settings" onClose={onClose}>
      <fieldset className="field">
        <legend>Graphics quality</legend>
        {(['low', 'medium', 'high'] as const).map((q) => (
          <label key={q} className="check">
            <input type="radio" name="quality" checked={settings.quality === q} onChange={() => set('quality', q)} /> {q}
          </label>
        ))}
      </fieldset>
      <fieldset className="field">
        <legend>Time of day</legend>
        {(['auto', 'day', 'night'] as const).map((t) => (
          <label key={t} className="check">
            <input type="radio" name="tod" checked={settings.timeOfDay === t} onChange={() => set('timeOfDay', t)} /> {t}
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => set('reducedMotion', e.target.checked)} /> Reduce motion (static traffic, no camera easing)
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.labels} onChange={(e) => set('labels', e.target.checked)} /> Show district labels
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.joystick} onChange={(e) => set('joystick', e.target.checked)} /> On-screen joystick
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.cameraAssist} onChange={(e) => set('cameraAssist', e.target.checked)} /> Turn the camera to show hidden entrances
      </label>
      <div className="btn-col">
        <button type="button" className="city-btn" onClick={onDirectory}>
          Switch to 2D directory view
        </button>
      </div>
    </Panel>
  );
}

/** Global Markets billboard when no market charts destination is configured. */
export function MarketsPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="Global Markets" subtitle={<SimTag>board figures are simulated</SimTag>} onClose={onClose}>
      <p>The market charts link for this billboard hasn&apos;t been set up yet.</p>
      <p className="small muted">
        The tickers on the board (GRO, KST, ORB, CPL) are fictional and only decorate the city. Once a market charts website is approved, it will open
        from here in a new tab.
      </p>
    </Panel>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="Controls" onClose={onClose}>
      <ul className="list">
        <li>
          <kbd>W A S D</kbd> / arrow keys — move
        </li>
        <li>
          <kbd>E</kbd> — interact with the nearest place
        </li>
        <li>
          <kbd>Esc</kbd> — close panels / leave a building
        </li>
        <li>Click or tap the ground — walk there</li>
        <li>Touch: on-screen joystick (enable in Settings) and the Interact button</li>
        <li>
          <kbd>P</kbd> — places list · <kbd>+</kbd>/<kbd>-</kbd> — zoom
        </li>
        <li>
          <kbd>Q</kbd>/<kbd>R</kbd> — rotate the view (the camera also turns by itself to show entrances on the far side of a building)
        </li>
      </ul>
      <p className="small muted">
        Everything in the city links to the same jobs, companies and events as the Grooveli web app. People shown are simulated. All data is synthetic.
      </p>
    </Panel>
  );
}

export function hqFor(data: WorldData, organizationId: string | undefined | null) {
  return organizationId ? data.hqs.find((h) => h.organization.id === organizationId) ?? null : null;
}

/** Hamburger menu: everything the old HUD button row offered, plus the travel map. */
export function MenuPanel({
  onClose,
  onPlaces,
  onSettings,
  onHelp,
  onZoom,
  onRotate,
  homeHref,
  map,
}: {
  onClose: () => void;
  onPlaces: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onZoom: (dir: 1 | -1) => void;
  /** Rotate the city view (+1 right, −1 left, 0 reset to north); absent inside buildings. */
  onRotate?: (dir: 1 | -1 | 0) => void;
  homeHref: string;
  map: ReactNode;
}) {
  return (
    <Panel title="Menu" onClose={onClose}>
      <div className="btn-col">
        <button type="button" className="city-btn" onClick={onPlaces}>
          🗺️ Places (P)
        </button>
        <button type="button" className="city-btn" onClick={onSettings}>
          ⚙️ Settings
        </button>
        <button type="button" className="city-btn" onClick={onHelp}>
          ❔ Controls &amp; help
        </button>
        <div className="row-btns">
          <button type="button" className="city-btn" onClick={() => onZoom(1)} aria-label="Zoom in">
            ＋ Zoom in
          </button>
          <button type="button" className="city-btn" onClick={() => onZoom(-1)} aria-label="Zoom out">
            － Zoom out
          </button>
        </div>
        {onRotate ? (
          <div className="row-btns">
            <button type="button" className="city-btn" onClick={() => onRotate(-1)} aria-label="Rotate view left">
              ↺ Rotate (Q)
            </button>
            <button type="button" className="city-btn" onClick={() => onRotate(1)} aria-label="Rotate view right">
              ↻ Rotate (R)
            </button>
            <button type="button" className="city-btn" onClick={() => onRotate(0)} aria-label="Reset view to north">
              ⬆ North
            </button>
          </div>
        ) : null}
        <a className="city-btn" href={homeHref}>
          ↩ Grooveli web
        </a>
      </div>
      <h3>Map</h3>
      {map}
    </Panel>
  );
}

/** City notifications: upcoming public events (synthetic fixtures). */
export function NotificationsPanel({ events, onClose }: { events: CityEvent[]; onClose: () => void }) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <Panel title="Notifications" subtitle={<>Upcoming city events · <SimTag>demo data</SimTag></>} onClose={onClose}>
      {sorted.length === 0 ? (
        <p className="muted">Nothing new.</p>
      ) : (
        <ul className="list">
          {sorted.map((e) => (
            <li key={e.id} className="notice">
              <strong>{e.title}</strong>
              <span className="small muted">
                {getDistrict(e.district).name} · {formatDateTime(e.start)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-col">
        <WebLink href={webHref({ type: 'openSocial' })}>All events in Grooveli web</WebLink>
      </div>
    </Panel>
  );
}
