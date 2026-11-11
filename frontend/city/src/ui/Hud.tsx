import { useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { initials } from '@grooveli/frontend-domain/public';
import type { InputState } from '../scene/Player';
import type { CityIdentity } from '../services/identity';

/** Reference top-left card: avatar disc, name, level and (only when supplied) progress to next level. */
export function IdentityChip({ identity, webHref }: { identity: CityIdentity; webHref: string }) {
  const pct = identity.levelProgress != null ? Math.round(identity.levelProgress * 100) : null;
  return (
    <a className="hud-identity" href={webHref} aria-label={`${identity.displayName}${identity.level ? `, career level ${identity.level}` : ''}${pct != null ? `, ${pct}% to next level` : ''}. Open Grooveli web.`}>
      <span className="avatar-badge" aria-hidden="true">
        {initials(identity.displayName)}
      </span>
      <span className="identity-text">
        <strong>{identity.displayName}</strong>
        <span className="identity-level">
          <span>{identity.level ? `Lv ${identity.level}` : identity.source === 'guest' ? 'Guest' : 'Explorer'}</span>
          {pct != null ? (
            <span className="xp-bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
          ) : null}
        </span>
      </span>
    </a>
  );
}

/** Short district name for the top-centre pill ("Grooveli Plaza" → "Plaza"). */
export function shortDistrictName(name: string) {
  return name.replace(/^Grooveli /, '').replace(/ District$/, '').replace(/ & Training Center$/, '');
}

export function DistrictPill({ name, event }: { name: string; event: boolean }) {
  return (
    <div className="hud-district" aria-hidden="true">
      <span className="dot" /> {shortDistrictName(name)}
      {event ? <span className="pill-event">event today</span> : null}
    </div>
  );
}

const ICONS = {
  people: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16.5 14.6c2.6.2 4.4 1.9 5 5" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.8" r="2.3" />
    </svg>
  ),
};

export function RoundButton({ label, icon, onClick, badge, dot }: { label: string; icon: keyof typeof ICONS; onClick: () => void; badge?: ReactNode; dot?: boolean }) {
  return (
    <button type="button" className="hud-round" onClick={onClick} aria-label={label} title={label}>
      {ICONS[icon]}
      {dot ? <span className="hud-dot" aria-hidden="true" /> : null}
      {badge != null ? <span className="hud-badge" aria-hidden="true">{badge}</span> : null}
    </button>
  );
}

export function PinIcon() {
  return ICONS.pin;
}

/** Touch joystick writing screen-space axes into the shared input ref. */
export function Joystick({ input }: { input: MutableRefObject<InputState> }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const update = (e: ReactPointerEvent) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.max(1, Math.hypot(dx, dy));
    input.current = { x: dx / len, y: -dy / len };
    if (knob.current) knob.current.style.transform = `translate(${(dx / len) * 28}px, ${(dy / len) * 28}px)`;
  };
  const end = () => {
    active.current = null;
    input.current = { x: 0, y: 0 };
    if (knob.current) knob.current.style.transform = '';
  };
  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label="Movement joystick"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="joystick-knob" />
    </div>
  );
}

export function HudButton({ onClick, label, children, pressed }: { onClick: () => void; label: string; children: ReactNode; pressed?: boolean }) {
  return (
    <button type="button" className="hud-btn" onClick={onClick} aria-label={label} aria-pressed={pressed} title={label}>
      {children}
    </button>
  );
}

/** People button: count + SIM badge; the accessible name states the people are simulated. */
export function PresenceChip({ count, onClick }: { count: number; onClick: () => void }) {
  return <RoundButton label={`${count} simulated people nearby. Open people panel.`} icon="people" onClick={onClick} badge={<>{count} SIM</>} />;
}
