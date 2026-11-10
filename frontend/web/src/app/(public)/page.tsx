import Link from 'next/link';
import { APP_NAME } from '@grooveli/shared';
import { DISTRICTS, JOBS, ORGANIZATIONS, CITY_EVENTS, formatDate } from '@grooveli/frontend-domain';
import { EnterCityButton } from '@/components/enter-city-button';
import { salaryRange } from '@/lib/job-format';

const ECOSYSTEMS = [
  {
    title: 'Career',
    icon: '🚀',
    body: 'Build a professional identity, find jobs that fit, grow skills through missions and get guidance from a career assistant.',
    href: '/opportunities',
    cta: 'Browse opportunities',
  },
  {
    title: 'Workplace',
    icon: '🏢',
    body: 'Organisations recruit, onboard and manage people: HR operations, payroll previews, engagement and workforce intelligence.',
    href: '/signup?type=organization',
    cta: 'Set up an organisation',
  },
  {
    title: 'Social & city',
    icon: '🏙️',
    body: 'Explore a living city of districts, company headquarters, events and communities — a friendlier way into the same opportunities.',
    href: '/social',
    cta: 'See events & communities',
  },
];

export default function HomePage() {
  const recent = [...JOBS].sort((a, b) => b.postedOn.localeCompare(a.postedOn)).slice(0, 4);
  const upcoming = [...CITY_EVENTS].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
  return (
    <>
      <section className="hero">
        <div className="container stack" style={{ ['--gap' as string]: '20px' }}>
          <span className="badge badge-mock" style={{ alignSelf: 'flex-start' }}>
            Demo build · synthetic data
          </span>
          <h1>
            A career platform
            <br />
            you can walk around in.
          </h1>
          <p>
            {APP_NAME} connects people, organisations and opportunities through a living virtual city. Every game mechanic points to a real career
            outcome: discovery, skills, applications, interviews and hires.
          </p>
          <div className="row">
            <Link className="btn btn-primary" href="/signup">
              Start your journey
            </Link>
            <EnterCityButton />
            <Link className="btn btn-ghost" href="/opportunities" style={{ color: '#fff' }}>
              Browse jobs without the city →
            </Link>
          </div>
          <dl className="row" style={{ ['--gap' as string]: '28px', marginTop: 12 }}>
            <div>
              <dt className="small" style={{ color: '#a5b4fc' }}>
                Open roles (synthetic)
              </dt>
              <dd style={{ fontSize: '1.5rem', fontWeight: 700 }}>{JOBS.length}</dd>
            </div>
            <div>
              <dt className="small" style={{ color: '#a5b4fc' }}>
                Organisations
              </dt>
              <dd style={{ fontSize: '1.5rem', fontWeight: 700 }}>{ORGANIZATIONS.length}</dd>
            </div>
            <div>
              <dt className="small" style={{ color: '#a5b4fc' }}>
                City places
              </dt>
              <dd style={{ fontSize: '1.5rem', fontWeight: 700 }}>{DISTRICTS.length}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section container" aria-labelledby="eco">
        <h2 id="eco">Three connected ecosystems</h2>
        <div className="grid-3" style={{ marginTop: 16 }}>
          {ECOSYSTEMS.map((e) => (
            <article key={e.title} className="card stack">
              <span style={{ fontSize: 28 }} aria-hidden="true">
                {e.icon}
              </span>
              <h3>{e.title}</h3>
              <p className="muted">{e.body}</p>
              <Link href={e.href}>{e.cta} →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section container" aria-labelledby="districts">
        <div className="row-between">
          <h2 id="districts">Explore the districts</h2>
          <Link href="/city-directory">Accessible city directory →</Link>
        </div>
        <ul className="grid" style={{ ['--min' as string]: '220px', listStyle: 'none', padding: 0, marginTop: 16 }}>
          {DISTRICTS.map((d) => (
            <li key={d.id} className="card" style={{ borderTop: `4px solid ${d.color}` }}>
              <h3>{d.name}</h3>
              <p className="small muted">{d.tagline}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section container grid-2" aria-label="Latest">
        <div className="card">
          <div className="card-header">
            <h2>Newest opportunities</h2>
            <Link href="/opportunities">See all</Link>
          </div>
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {recent.map((j) => (
              <li key={j.id} className="row-between">
                <Link href={`/opportunities/${j.id}`}>{j.title}</Link>
                <span className="small muted">
                  {ORGANIZATIONS.find((o) => o.id === j.organizationId)?.name} · {salaryRange(j)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Upcoming city events</h2>
            <Link href="/social">See all</Link>
          </div>
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {upcoming.map((e) => (
              <li key={e.id} className="row-between">
                <Link href={`/social/events/${e.id}`}>{e.title}</Link>
                <span className="small muted">{formatDate(e.start)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
