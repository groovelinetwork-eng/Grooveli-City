import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';

function btnClass(variant: Variant = 'default', size?: 'sm', block?: boolean, extra?: string) {
  return ['btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'btn-block', extra].filter(Boolean).join(' ');
}

export function Button({
  variant,
  size,
  block,
  pending,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm'; block?: boolean; pending?: boolean }) {
  return (
    <button
      type="button"
      className={btnClass(variant, size, block, className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending ? <span aria-hidden="true">⏳</span> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant,
  size,
  block,
  className,
  children,
  external,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: 'sm'; block?: boolean; external?: boolean }) {
  if (external) {
    return (
      <a href={href} className={btnClass(variant, size, block, className)} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={btnClass(variant, size, block, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  as: Tag = 'section',
  ...rest
}: { title?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; 'aria-label'?: string }) {
  return (
    <Tag className={['card', className].filter(Boolean).join(' ')} {...rest}>
      {(title || actions) && (
        <div className="card-header">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions ? <div className="row">{actions}</div> : null}
        </div>
      )}
      {children}
    </Tag>
  );
}

export type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'mock';

export function Badge({ tone = 'default', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={['badge', tone !== 'default' && `badge-${tone}`].filter(Boolean).join(' ')} title={title}>
      {children}
    </span>
  );
}

/** Explicit label for simulated/synthetic features. Use wherever a mock could be mistaken for a live service. */
export function MockBadge({ children = 'Simulated' }: { children?: ReactNode }) {
  return (
    <Badge tone="mock" title="Synthetic demo behaviour — no backend service is involved">
      {children}
    </Badge>
  );
}

export function MockNotice({ title = 'Simulated', children }: { title?: string; children: ReactNode }) {
  return (
    <div className="notice" role="note">
      <span aria-hidden="true">🧪</span>
      <div>
        <strong>{title}.</strong> {children}
      </div>
    </div>
  );
}

export function InfoNotice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'note'}>
      <span aria-hidden="true">{tone === 'error' ? '⚠️' : 'ℹ️'}</span>
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, actions, badge }: { title: string; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <div className="row">
          <h1>{title}</h1>
          {badge}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint ? <span className="small muted">{hint}</span> : null}
    </div>
  );
}

export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p style={{ fontWeight: 600, color: 'var(--g-text)' }}>{title}</p>
      {children ? <p className="small">{children}</p> : null}
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 56 }} />
      ))}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', children, retry }: { title?: string; children?: ReactNode; retry?: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <span aria-hidden="true">⚠️</span>
      <div className="stack" style={{ ['--gap' as string]: '6px' }}>
        <strong style={{ color: 'var(--g-danger)' }}>{title}</strong>
        {children}
        {retry ? (
          <div>
            <Button size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
