import { useState } from 'react';
import { DISTRICTS, type DistrictId } from '@grooveli/frontend-domain/public';
import { cityConfig } from '../app/config';
import { webHref } from '../app/settings';
import { stationsFor, type InteriorKind, type Station } from '../app/interiors';
import type { CityIdentity } from '../services/identity';
import type { WorldData } from '../services/world-data';
import { PLACED_BUILDINGS } from '../world/layout';
import { DistrictPanel, StationPanel, hqFor } from './panels';
import { SimTag } from './Panel';

/**
 * Non-WebGL alternative: every district, building and interior station with
 * the same panels and web links as the 3D city. Used when WebGL is
 * unavailable, the context is lost, the renderer errors, or the user opts in.
 */
export function Directory({
  identity,
  data,
  reason,
  initialDistrict,
  onTry3d,
}: {
  identity: CityIdentity;
  data: WorldData;
  reason: string;
  initialDistrict: DistrictId | null;
  onTry3d?: () => void;
}) {
  const [district, setDistrict] = useState<DistrictId>(initialDistrict ?? 'plaza');
  const [room, setRoom] = useState<{ kind: InteriorKind; orgId?: string; station: Station | null } | null>(null);
  const enter = (buildingId: string) => {
    const b = PLACED_BUILDINGS.find((x) => x.id === buildingId);
    if (!b) return;
    const kind: InteriorKind = b.district === 'apartment' ? 'apartment' : b.district === 'ai-center' ? 'ai-center' : 'hq';
    setRoom({ kind, orgId: b.organizationId, station: null });
  };
  return (
    <div className="directory">
      <header className="directory-header">
        <h1>Grooveli City — directory view</h1>
        <p role="status">{reason}</p>
        <p className="small">
          Signed in as {identity.displayName}. <a href={cityConfig.webUrl}>Back to Grooveli web</a>
          {onTry3d ? (
            <>
              {' '}
              ·{' '}
              <button type="button" className="link-btn" onClick={onTry3d}>
                Try the 3D city
              </button>
            </>
          ) : null}
        </p>
      </header>
      <div className="directory-grid">
        <nav aria-label="Districts">
          <ul className="list">
            {DISTRICTS.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="city-btn"
                  aria-pressed={district === d.id}
                  style={{ borderLeft: `4px solid ${d.color}`, width: '100%' }}
                  onClick={() => {
                    setDistrict(d.id);
                    setRoom(null);
                  }}
                >
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main>
          {room ? (
            <div className="stack">
              <button type="button" className="link-btn" onClick={() => setRoom(null)}>
                ← Leave building
              </button>
              <ul className="list" aria-label="Things in this room">
                {stationsFor(room.kind).map((s) => (
                  <li key={s.id}>
                    <button type="button" className="city-btn" onClick={() => setRoom({ ...room, station: s })}>
                      {s.icon} {s.label}
                    </button>
                  </li>
                ))}
              </ul>
              {room.station ? (
                <StationPanel kind={room.kind} station={room.station} hq={hqFor(data, room.orgId)} identity={identity} onClose={() => setRoom({ ...room, station: null })} />
              ) : null}
            </div>
          ) : (
            <DistrictPanel district={district} data={data} onClose={() => setDistrict('plaza')} onEnter={enter} />
          )}
          <p className="small muted">
            Also available: <a href={webHref({ type: 'browseJobs' })}>all jobs</a> · <a href={`${cityConfig.webUrl}/city-directory`}>web city directory</a>. People in the
            city are <SimTag>simulated</SimTag>.
          </p>
        </main>
      </div>
    </div>
  );
}
