import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'How Grooveli works' };

const LAYERS = [
  { name: 'Grooveli World', body: 'The interactive city: districts, headquarters, apartments, events and other people. It is the experience layer, not the product by itself.' },
  { name: 'Grooveli Careers', body: 'The real marketplace underneath: profiles, jobs, applications, interviews and hiring — always usable without the city.' },
  { name: 'Grooveli Workplace', body: 'Organisation workspaces for recruitment, HR operations, payroll, engagement and workforce intelligence, governed by roles and plans.' },
  { name: 'Grooveli AI', body: 'Career and recruitment assistants. In this demo build the assistant is a transparent rule-based simulation — no AI inference runs.' },
];

const LIMITS = [
  'All people, companies, jobs, salaries and metrics are synthetic.',
  'Sign-in uses demo personas. No credentials are verified and no secure session exists.',
  'Applications, interviews and invitations are simulated — no employer or person is contacted.',
  'Payroll screens produce illustrative previews. No money moves and no statutory filing occurs; tax and pension figures are not jurisdiction-accurate.',
  'Other people in the city are simulated presence, not live players.',
  'Data is stored only in your browser (localStorage) and can be reset at any time.',
];

export default function AboutPage() {
  return (
    <div className="container section stack" style={{ ['--gap' as string]: '28px' }}>
      <header className="stack">
        <h1>How Grooveli works</h1>
        <p className="muted" style={{ maxWidth: 720 }}>
          Grooveli is a career platform experienced like a game. Exploration leads to discovery, missions build skills, the profile represents
          professional identity, and XP reflects meaningful progress — never application spam.
        </p>
      </header>
      <section aria-labelledby="layers">
        <h2 id="layers">Product layers</h2>
        <div className="grid" style={{ marginTop: 12 }}>
          {LAYERS.map((l) => (
            <article key={l.name} className="card">
              <h3>{l.name}</h3>
              <p className="small muted">{l.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="journey" className="card">
        <h2 id="journey">From exploration to employment</h2>
        <ol className="stack" style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Create your identity and avatar; choose how you like to work.</li>
          <li>Explore districts or search the marketplace directly — they show the same jobs.</li>
          <li>Check your fit: see matching skills, unmet requirements and gaps explained.</li>
          <li>Apply with explicit confirmation; track applications and interviews.</li>
          <li>Close gaps through missions, challenges and courses that earn XP.</li>
        </ol>
      </section>
      <section aria-labelledby="limits" className="card">
        <h2 id="limits">What this demo build does not do</h2>
        <ul className="stack" style={{ paddingLeft: 20, marginTop: 8 }}>
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
      <div className="row">
        <Link className="btn btn-primary" href="/signup">
          Get started
        </Link>
        <Link className="btn" href="/help">
          Help & controls
        </Link>
      </div>
    </div>
  );
}
