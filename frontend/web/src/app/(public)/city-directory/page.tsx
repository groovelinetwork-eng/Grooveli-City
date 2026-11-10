'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BUILDINGS, DISTRICTS, PARK_BLOCK, intentToPath, type DistrictId } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { EnterCityButton } from '@/components/enter-city-button';

/** Non-WebGL, keyboard- and screen-reader-friendly alternative to the 3D city. */
export default function CityDirectoryPage() {
  const [selected, setSelected] = useState<DistrictId>('plaza');
  const jobs = useDemoStore((s) => s.jobs);
  const orgs = useDemoStore((s) => s.organizations);
  const events = useDemoStore((s) => s.events);
  const district = DISTRICTS.find((d) => d.id === selected)!;
  const cell = 120;
  const gap = 24;

  return (
    <div className="container section">
      <PageHeader
        title="City directory"
        description="Every place in Grooveli City, without 3D. Same destinations, same jobs and events."
        actions={<EnterCityButton district={selected} label={`Open ${district.name} in 3D`} className="btn btn-primary" />}
      />
      <div className="grid-2">
        <Card title="Map">
          <svg viewBox={`0 0 ${4 * cell + 3 * gap} ${3 * cell + 2 * gap}`} role="group" aria-label="City map. Use Tab to move between districts and Enter to select." className="chart">
            {DISTRICTS.map((d) => {
              const x = d.grid.x * (cell + gap);
              const y = d.grid.z * (cell + gap);
              const active = d.id === selected;
              return (
                <g
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={d.name}
                  onClick={() => setSelected(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(d.id);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect x={x} y={y} width={cell} height={cell} rx={12} fill={d.color} opacity={active ? 1 : 0.55} stroke={active ? 'var(--g-text)' : 'none'} strokeWidth={3} />
                  <text x={x + cell / 2} y={y + cell / 2} textAnchor="middle" style={{ fill: '#fff', fontWeight: 700, fontSize: 12 }}>
                    {d.name.replace(' District', '').replace(' & Training Center', '')}
                  </text>
                </g>
              );
            })}
            <rect x={PARK_BLOCK.x * (cell + gap)} y={PARK_BLOCK.z * (cell + gap)} width={cell} height={cell} rx={12} fill="#16a34a" opacity={0.35} />
            <text x={PARK_BLOCK.x * (cell + gap) + cell / 2} y={PARK_BLOCK.z * (cell + gap) + cell / 2} textAnchor="middle">
              City Park
            </text>
          </svg>
        </Card>
        <Card title={district.name} actions={<Badge>{district.tagline}</Badge>}>
          <div className="stack" aria-live="polite">
            <p>{district.description}</p>
            <h3>Things to do</h3>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, ['--gap' as string]: '6px' }}>
              {district.actions.map((a) => (
                <li key={a.label}>
                  <Link href={intentToPath(a.intent)}>{a.label} →</Link>
                </li>
              ))}
            </ul>
            <h3>Buildings</h3>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, ['--gap' as string]: '6px' }}>
              {BUILDINGS.filter((b) => b.district === selected).map((b) => (
                <li key={b.id} className="row-between">
                  <span>{b.name}</span>
                  {b.organizationId ? <Link href={`/companies/${b.organizationId}`}>Company profile</Link> : <span className="small muted">{b.kind}</span>}
                </li>
              ))}
              {orgs
                .filter((o) => o.district === selected && !BUILDINGS.some((b) => b.organizationId === o.id))
                .map((o) => (
                  <li key={o.id} className="row-between">
                    <span>{o.name} (new HQ)</span>
                    <Link href={`/companies/${o.id}`}>Company profile</Link>
                  </li>
                ))}
            </ul>
            <p className="small muted">
              {jobs.filter((j) => j.district === selected && j.status === 'published').length} open jobs ·{' '}
              {events.filter((e) => e.district === selected).length} upcoming events
            </p>
          </div>
        </Card>
      </div>
      <h2 style={{ marginTop: 24 }}>All places</h2>
      <ul className="grid" style={{ ['--min' as string]: '240px', listStyle: 'none', padding: 0, marginTop: 12 }}>
        {DISTRICTS.map((d) => (
          <li key={d.id} className="card">
            <button type="button" className="btn btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => setSelected(d.id)} aria-pressed={d.id === selected}>
              <strong>{d.name}</strong>
            </button>
            <p className="small muted">{d.tagline}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
