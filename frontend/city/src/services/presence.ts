import { SOCIAL_PROFILES, type PresenceProjection } from '@grooveli/frontend-domain/public';
import { makePedestrians, pointOnLoop } from '../world/ambient';
import { districtAt } from '../world/layout';

/**
 * Presence adapter contract. A future realtime backend (WebSocket/SSE — an open
 * decision) would implement this. Until then only the SIMULATED adapter exists
 * and every projection is labelled `source: 'simulated'`.
 */
export interface PresenceAdapter {
  readonly kind: 'simulated' | 'live';
  subscribe(cb: (people: PresenceProjection[]) => void): () => void;
}

export const MAX_PRESENCE_HZ = 2;

export class SimulatedPresenceAdapter implements PresenceAdapter {
  readonly kind = 'simulated' as const;
  private readonly walkers = makePedestrians(SOCIAL_PROFILES.length).map((w, i) => ({ ...w, offset: w.offset + i * 7 }));

  constructor(
    private readonly hz = 1,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (hz > MAX_PRESENCE_HZ) throw new Error(`Presence updates are bounded to ${MAX_PRESENCE_HZ} Hz`);
  }

  snapshot(): PresenceProjection[] {
    const t = this.now() / 1000;
    return SOCIAL_PROFILES.map((p, i) => {
      const w = this.walkers[i]!;
      const { p: pos } = pointOnLoop(w.loop, w.offset + t * w.speed * 0.8);
      const district = districtAt(pos) ?? p.district;
      return {
        id: `sim-${p.id}`,
        displayName: p.name,
        avatar: p.avatar,
        district,
        position: pos,
        status: i % 4 === 0 ? 'at-event' : i % 3 === 0 ? 'idle' : 'exploring',
        source: 'simulated',
      };
    });
  }

  subscribe(cb: (people: PresenceProjection[]) => void): () => void {
    cb(this.snapshot());
    const id = setInterval(() => cb(this.snapshot()), 1000 / this.hz);
    return () => clearInterval(id);
  }
}

/** Live presence requires an approved realtime contract; it fails visibly rather than faking it. */
export class UnavailableLivePresenceAdapter implements PresenceAdapter {
  readonly kind = 'live' as const;
  subscribe(): () => void {
    throw new Error('Live presence is not available: no realtime backend contract has been approved.');
  }
}
