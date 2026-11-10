'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './primitives';

// ── Tabs ────────────────────────────────────────────────────────────────────
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: ReactNode; content: ReactNode }[];
  value?: T;
  onChange?: (id: T) => void;
  label: string;
}) {
  const [internal, setInternal] = useState<T>(tabs[0]!.id);
  const active = value ?? internal;
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (id: T) => {
    setInternal(id);
    onChange?.(id);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    select(tabs[next]!.id);
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="tabs">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            className="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) =>
        t.id === active ? (
          <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`}>
            {t.content}
          </div>
        ) : null,
      )}
    </div>
  );
}

// ── DataTable ───────────────────────────────────────────────────────────────
export interface Column<R> {
  key: string;
  header: string;
  render: (row: R) => ReactNode;
  sortValue?: (row: R) => string | number;
  numeric?: boolean;
}

export function DataTable<R>({
  rows,
  columns,
  rowKey,
  caption,
  empty = 'No records',
  pageSize = 25,
}: {
  rows: R[];
  columns: Column<R>[];
  rowKey: (row: R) => string;
  caption: string;
  empty?: ReactNode;
  pageSize?: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
    });
  }, [rows, columns, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const dir = sort?.key === c.key ? sort.dir : 0;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={c.numeric ? 'num' : undefined}
                    aria-sort={dir === 1 ? 'ascending' : dir === -1 ? 'descending' : undefined}
                  >
                    {c.sortValue ? (
                      <button type="button" onClick={() => setSort({ key: c.key, dir: dir === 1 ? -1 : 1 })}>
                        {c.header} {dir === 1 ? '▲' : dir === -1 ? '▼' : ''}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  {empty}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={rowKey(r)}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'num' : undefined}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav className="row" aria-label={`${caption} pagination`}>
          <Button size="sm" onClick={() => setPage(current - 1)} disabled={current === 0}>
            Previous
          </Button>
          <span className="small muted">
            Page {current + 1} of {pages} · {sorted.length} rows
          </span>
          <Button size="sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

// ── Dialog ──────────────────────────────────────────────────────────────────
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="dialog-body">
          <div className="row-between">
            <h2 id={titleId}>{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
              ✕
            </Button>
          </div>
          {children}
          {actions ? <div className="dialog-actions">{actions}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

// ── Charts (SVG with accessible data table fallback) ───────────────────────
export interface Datum {
  label: string;
  value: number;
}

function DataFallback({ data, caption, format }: { data: Datum[]; caption: string; format: (n: number) => string }) {
  return (
    <details className="chart-data">
      <summary>View data table</summary>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col" className="num">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td className="num">{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function BarChart({
  data,
  title,
  format = (n) => n.toLocaleString(),
  horizontal,
}: {
  data: Datum[];
  title: string;
  format?: (n: number) => string;
  horizontal?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (horizontal) {
    return (
      <figure className="stack" style={{ ['--gap' as string]: '6px' }}>
        <figcaption className="sr-only">{title}</figcaption>
        <div aria-hidden="true" className="stack" style={{ ['--gap' as string]: '6px' }}>
          {data.map((d) => (
            <div key={d.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 30%) 1fr auto', gap: 8, alignItems: 'center' }}>
              <span className="small wrap-anywhere">{d.label}</span>
              <div className="progress" style={{ height: 12 }}>
                <div style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
              <span className="small mono">{format(d.value)}</span>
            </div>
          ))}
        </div>
        <DataFallback data={data} caption={title} format={format} />
      </figure>
    );
  }
  const w = 560;
  const h = 200;
  const bw = (w - 40) / Math.max(1, data.length);
  return (
    <figure>
      <svg className="chart" viewBox={`0 0 ${w} ${h + 24}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} className="grid-line" x1={30} x2={w} y1={h - t * (h - 20)} y2={h - t * (h - 20)} />
        ))}
        {data.map((d, i) => {
          const bh = (d.value / max) * (h - 20);
          return (
            <g key={d.label}>
              <rect className="bar" x={34 + i * bw + bw * 0.15} y={h - bh} width={bw * 0.7} height={bh} rx={3} />
              <text x={34 + i * bw + bw / 2} y={h + 16} textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <DataFallback data={data} caption={title} format={format} />
    </figure>
  );
}

export function LineChart({ data, title, format = (n) => n.toLocaleString() }: { data: Datum[]; title: string; format?: (n: number) => string }) {
  const w = 560;
  const h = 200;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const x = (i: number) => 34 + (i * (w - 50)) / Math.max(1, data.length - 1);
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * (h - 20);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`).join(' ');
  return (
    <figure>
      <svg className="chart" viewBox={`0 0 ${w} ${h + 24}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} className="grid-line" x1={30} x2={w} y1={h - t * (h - 20)} y2={h - t * (h - 20)} />
        ))}
        <path className="line" d={path} />
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.value)} r={4} fill="var(--g-primary)" />
            <text x={x(i)} y={h + 16} textAnchor="middle">
              {d.label}
            </text>
          </g>
        ))}
      </svg>
      <DataFallback data={data} caption={title} format={format} />
    </figure>
  );
}
