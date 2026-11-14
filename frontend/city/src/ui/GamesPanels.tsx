import { useId, type ReactNode } from 'react';
import type { GameId } from '../world/gamesZone';
import { AVAILABILITY_LABEL, GAME_CATALOGUE, GAME_IDS, MODE_LABEL, displayAvailability, isPlayable, type GameAvailability, type GameListing } from '../services/games';
import { Panel } from './Panel';

/**
 * Games Zone information panels. Games are not playable yet: panels describe
 * each game and show its real availability. There is deliberately no working
 * "Play" or "Join" action until a game and its backend exist.
 */

function players(id: GameId) {
  const p = GAME_CATALOGUE[id].players;
  return p.min === p.max ? `${p.min} player${p.min > 1 ? 's' : ''}` : `${p.min}–${p.max} players`;
}

export function AvailabilityBadge({ value }: { value: GameAvailability }) {
  return <span className={`game-badge is-${value}`}>{AVAILABILITY_LABEL[value]}</span>;
}

/** Small illustrated preview of each game (inline SVG, decorative). */
export function GameArt({ id, size = 'large' }: { id: GameId; size?: 'large' | 'small' }) {
  const accent = GAME_CATALOGUE[id].accent;
  const bg = `game-art-bg-${useId().replace(/:/g, '')}`;
  let body: ReactNode;
  if (id === 'chess' || id === 'checkers') {
    const squares = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) squares.push(<rect key={`${r}-${c}`} x={20 + c * 10} y={6 + r * 10} width={10} height={10} fill="#3b2a55" />);
    body = (
      <>
        <rect x={20} y={6} width={80} height={60} rx={3} fill="#efe6d8" />
        {squares}
        {id === 'chess' ? (
          <>
            <text x={34} y={44} fontSize={30} fill="#111827">
              ♞
            </text>
            <text x={66} y={58} fontSize={28} fill="#f8fafc" stroke="#111827" strokeWidth={0.8}>
              ♚
            </text>
          </>
        ) : (
          [
            [35, 21, '#b91c1c'],
            [55, 21, '#b91c1c'],
            [45, 31, '#b91c1c'],
            [65, 51, '#111827'],
            [85, 51, '#111827'],
            [75, 41, '#111827'],
          ].map(([x, y, f], i) => <circle key={i} cx={x as number} cy={y as number} r={4.2} fill={f as string} stroke="#fff" strokeWidth={0.8} />)
        )}
      </>
    );
  } else if (id === 'ludo') {
    body = (
      <>
        <rect x={30} y={4} width={64} height={64} rx={4} fill="#f8fafc" />
        <rect x={30} y={4} width={26} height={26} fill="#ef4444" />
        <rect x={68} y={4} width={26} height={26} fill="#22c55e" />
        <rect x={30} y={42} width={26} height={26} fill="#3b82f6" />
        <rect x={68} y={42} width={26} height={26} fill="#facc15" />
        <polygon points="56,30 68,30 62,36" fill="#22c55e" />
        <polygon points="56,42 68,42 62,36" fill="#3b82f6" />
        <rect x={98} y={40} width={16} height={16} rx={3} fill="#fff" stroke="#cbd5e1" />
        <circle cx={102.5} cy={44.5} r={1.6} fill="#111827" />
        <circle cx={109.5} cy={51.5} r={1.6} fill="#111827" />
        <circle cx={106} cy={48} r={1.6} fill="#111827" />
      </>
    );
  } else if (id === 'pool') {
    const balls: [number, number, string][] = [
      [70, 36, '#facc15'],
      [76, 32, '#2563eb'],
      [76, 40, '#dc2626'],
      [82, 28, '#7c3aed'],
      [82, 36, '#111827'],
      [82, 44, '#f97316'],
    ];
    body = (
      <>
        <rect x={8} y={8} width={104} height={56} rx={8} fill="#6b3f22" />
        <rect x={15} y={15} width={90} height={42} rx={3} fill="#15803d" />
        {[
          [16, 16],
          [60, 14],
          [104, 16],
          [16, 56],
          [60, 58],
          [104, 56],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3.2} fill="#0b0f19" />
        ))}
        <circle cx={38} cy={36} r={3.4} fill="#f8fafc" />
        {balls.map(([x, y, f], i) => (
          <circle key={i} cx={x} cy={y} r={3.4} fill={f} />
        ))}
        <line x1={2} y1={52} x2={33} y2={38} stroke="#d6b88d" strokeWidth={2.4} strokeLinecap="round" />
      </>
    );
  } else {
    body = (
      <>
        <path
          d="M30 14 h18 a6 6 0 1 1 10 0 h18 v18 a6 6 0 1 0 0 10 v18 h-18 a6 6 0 1 1 -10 0 h-18 v-18 a6 6 0 1 0 0 -10 z"
          fill={accent}
          opacity={0.9}
        />
        <path d="M74 20 h16 v14 a5 5 0 1 1 0 8 v14 h-16 v-14 a5 5 0 1 0 0 -8 z" fill="#a78bfa" />
      </>
    );
  }
  return (
    <svg className={`game-art game-art-${size}`} viewBox="0 0 120 72" role="img" aria-label={`${GAME_CATALOGUE[id].title} illustration`} style={{ ['--game-accent' as string]: accent }}>
      <rect width={120} height={72} rx={10} fill={`url(#${bg})`} />
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1340" />
          <stop offset="1" stopColor="#0c1834" />
        </linearGradient>
      </defs>
      {body}
    </svg>
  );
}

export function GamePanel({ id, listing, onClose, onAllGames }: { id: GameId; listing: GameListing | undefined; onClose: () => void; onAllGames: () => void }) {
  const g = GAME_CATALOGUE[id];
  const status = displayAvailability(listing);
  return (
    <Panel title={g.title} subtitle={<AvailabilityBadge value={status} />} onClose={onClose}>
      <div className="game-panel" style={{ ['--game-accent' as string]: g.accent }}>
        <GameArt id={id} />
        <p className="game-tagline">{g.tagline}</p>
        <p>{g.description}</p>
        <dl className="game-facts">
          <div>
            <dt>Players</dt>
            <dd>{players(id)}</dd>
          </div>
          <div>
            <dt>Planned ways to play</dt>
            <dd>{g.plannedModes.map((m) => MODE_LABEL[m]).join(' · ')}</dd>
          </div>
        </dl>
        <div className="game-status" role="status">
          {status === 'maintenance' ? (
            <p>
              <strong>{g.title} is temporarily unavailable.</strong> {listing?.message ?? 'Please check back later.'}
            </p>
          ) : (
            <p>
              <strong>{g.title} isn&apos;t playable yet.</strong> The game, matches and invitations will open from this table once the Grooveli Games service is ready.
              Nothing is recorded or matched in the meantime.
            </p>
          )}
        </div>
        {/* Play stays unavailable until the game genuinely exists (services/games.ts isPlayable). */}
        {isPlayable(listing) ? null : (
          <button type="button" className="city-btn" aria-disabled="true" disabled>
            ▶ Play — {AVAILABILITY_LABEL[status].toLowerCase()}
          </button>
        )}
        <button type="button" className="city-btn" onClick={onAllGames}>
          🎮 All Grooveli games
        </button>
      </div>
    </Panel>
  );
}

export function GamesHubPanel({ listings, onSelect, onClose }: { listings: GameListing[]; onSelect: (id: GameId) => void; onClose: () => void }) {
  const byId = new Map(listings.map((l) => [l.id, l]));
  return (
    <Panel title="Grooveli Games Hub" subtitle="Play · Relax · Connect" onClose={onClose} wide>
      <p>
        Take a break between career moves: board, table and puzzle games to play with colleagues and new connections. The Games Zone is open to explore — the
        games themselves are on the way.
      </p>
      <ul className="games-grid">
        {GAME_IDS.map((id) => {
          const g = GAME_CATALOGUE[id];
          return (
            <li key={id}>
              <button type="button" className="game-card" onClick={() => onSelect(id)} aria-label={`${g.title}: ${AVAILABILITY_LABEL[displayAvailability(byId.get(id))]}. ${g.tagline}. Show details.`}>
                <GameArt id={id} size="small" />
                <span className="game-card-title">{g.title}</span>
                <span className="game-card-sub">
                  {players(id)} · {g.tagline}
                </span>
                <AvailabilityBadge value={displayAvailability(byId.get(id))} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="small muted">
        No matches, scores or live players are shown here: the people sitting at the tables are simulated decoration, and no game data is collected. Wagering
        of any kind is not part of Grooveli Games.
      </p>
    </Panel>
  );
}
