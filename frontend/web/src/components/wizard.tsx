'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui/primitives';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  /** Return an error message to block advancing. */
  validate?: () => string | null;
  optional?: boolean;
}

export function Wizard({
  steps,
  onFinish,
  finishLabel,
  pending,
  label,
}: {
  steps: WizardStep[];
  onFinish: () => void;
  finishLabel: string;
  pending?: boolean;
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  const next = () => {
    const err = step.validate?.() ?? null;
    setError(err);
    if (err) return;
    if (last) onFinish();
    else setIndex((i) => i + 1);
  };

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <nav aria-label={`${label} progress`}>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.id} aria-current={i === index ? 'step' : undefined} data-done={i < index}>
              {i < index ? '✓ ' : `${i + 1}. `}
              {s.title}
            </li>
          ))}
        </ol>
      </nav>
      <section className="card stack" style={{ ['--gap' as string]: '16px' }} aria-labelledby={`wizard-${step.id}`}>
        <header>
          <h2 id={`wizard-${step.id}`} ref={headingRef} tabIndex={-1}>
            Step {index + 1} of {steps.length}: {step.title} {step.optional ? <span className="small muted">(optional)</span> : null}
          </h2>
          {step.description ? <p className="muted small">{step.description}</p> : null}
        </header>
        {step.content}
        {error ? (
          <p role="alert" className="small" style={{ color: 'var(--g-danger)' }}>
            {error}
          </p>
        ) : null}
        <div className="row-between">
          <Button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            Back
          </Button>
          <div className="row">
            {step.optional && !last ? (
              <Button variant="ghost" onClick={() => setIndex((i) => i + 1)}>
                Skip
              </Button>
            ) : null}
            <Button variant="primary" onClick={next} pending={pending}>
              {last ? finishLabel : 'Continue'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
