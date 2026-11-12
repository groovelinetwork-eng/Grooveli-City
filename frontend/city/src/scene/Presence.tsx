import { useRef, useState, type MutableRefObject } from 'react';
import { useActiveFrame } from './sceneActive';
import { Html } from '@react-three/drei';
import type { PresenceProjection } from '@grooveli/frontend-domain/public';
import { Avatar } from './Avatar';
import { PERSON_SCALE } from './Ambient';
import type { LabelPortal } from './labels';
import { groundHeight } from '../world/layout';
import type { PlayerState } from './Player';

/** Name labels appear only for people near the player, keeping the reference view uncluttered. */
export const PRESENCE_LABEL_RADIUS = 7;

/**
 * Simulated presence: every name label carries an explicit "SIM" tag so these
 * figures can't be mistaken for live players (the HUD people button and footer
 * also say so).
 */
export function PresenceAvatars({ people, labels, labelPortal, player }: { people: PresenceProjection[]; labels: boolean; labelPortal: LabelPortal; player: MutableRefObject<PlayerState> }) {
  const [near, setNear] = useState<Set<string>>(() => new Set());
  const last = useRef(0);
  useActiveFrame(({ clock }) => {
    if (!labels || clock.elapsedTime - last.current < 0.3) return;
    last.current = clock.elapsedTime;
    const p = player.current.pos;
    const next = new Set(people.filter((x) => Math.hypot(x.position.x - p.x, x.position.z - p.z) <= PRESENCE_LABEL_RADIUS).map((x) => x.id));
    setNear((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next));
  });
  return (
    <group>
      {people.map((p) => (
        <group key={p.id} position={[p.position.x, groundHeight(p.position), p.position.z]}>
          <Avatar avatar={p.avatar} scale={PERSON_SCALE * 0.95} />
          {labels && near.has(p.id) ? (
            <Html portal={labelPortal} position={[0, 3.2, 0]} center zIndexRange={[10, 0]} className="label label-presence" aria-hidden="true">
              {p.displayName.split(' ')[0]} <span className="sim-tag">SIM</span>
            </Html>
          ) : null}
        </group>
      ))}
    </group>
  );
}
