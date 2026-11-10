'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
}

function useFieldIds() {
  const id = useId();
  return { id, hintId: `${id}-hint`, errorId: `${id}-err` };
}

function describedBy(hint: unknown, error: unknown, ids: { hintId: string; errorId: string }) {
  return [hint && ids.hintId, error && ids.errorId].filter(Boolean).join(' ') || undefined;
}

export function TextField({ label, hint, error, required, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds();
  return (
    <div className="field">
      <label htmlFor={ids.id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={ids.id}
        className="input"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        {...rest}
      />
      {hint ? <span id={ids.hintId} className="hint">{hint}</span> : null}
      {error ? <span id={ids.errorId} className="error" role="alert">{error}</span> : null}
    </div>
  );
}

export function TextArea({ label, hint, error, required, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useFieldIds();
  return (
    <div className="field">
      <label htmlFor={ids.id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        id={ids.id}
        className="textarea"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        {...rest}
      />
      {hint ? <span id={ids.hintId} className="hint">{hint}</span> : null}
      {error ? <span id={ids.errorId} className="error" role="alert">{error}</span> : null}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  options,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const ids = useFieldIds();
  return (
    <div className="field">
      <label htmlFor={ids.id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={ids.id}
        className="select"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span id={ids.hintId} className="hint">{hint}</span> : null}
      {error ? <span id={ids.errorId} className="error" role="alert">{error}</span> : null}
    </div>
  );
}

export function Checkbox({ label, ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/** Accessible single/multi choice rendered as chips (radio/checkbox group). */
export function ChoiceChips<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  multiple,
  name,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  options: { value: T; label: ReactNode }[];
  value: T | T[] | null;
  onChange: (next: T | T[]) => void;
  multiple?: boolean;
  name?: string;
}) {
  const auto = useId();
  const groupName = name ?? auto;
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      {hint ? <span className="hint">{hint}</span> : null}
      <div className="chips" style={{ marginTop: 6 }}>
        {options.map((o) => (
          <label key={o.value} className="chip">
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={groupName}
              value={o.value}
              checked={selected.includes(o.value)}
              onChange={() => {
                if (multiple) {
                  onChange(selected.includes(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value]);
                } else {
                  onChange(o.value);
                }
              }}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
