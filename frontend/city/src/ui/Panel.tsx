import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Non-modal side panel. Focus moves in on open; Esc is handled by the app shell. */
export function Panel({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [title]);
  return (
    <section className={`panel${wide ? ' panel-wide' : ''}`} role="dialog" aria-labelledby={id} tabIndex={-1} ref={ref}>
      <header className="panel-header">
        <div>
          <h2 id={id}>{title}</h2>
          {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel (Esc)">
          ✕
        </button>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function WebLink({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <a className={`city-btn${primary ? ' city-btn-primary' : ''}`} href={href}>
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

export function SimTag({ children = 'SIMULATED' }: { children?: ReactNode }) {
  return (
    <span className="sim-tag" title="Generated locally — not live data">
      {children}
    </span>
  );
}
