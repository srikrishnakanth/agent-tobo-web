'use client';
// KK-UI-GOVERNOR generated (modern / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React, { useId } from 'react';
export type KkInputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; help?: React.ReactNode; error?: React.ReactNode; textarea?: boolean };
export function KkInput({ label, help, error, textarea = false, id, className = '', ...rest }: KkInputProps) {
  const auto = useId();
  const inputId = id || auto;
  const describedBy = [help ? inputId + '-help' : null, error ? inputId + '-err' : null].filter(Boolean).join(' ') || undefined;
  const Field = (textarea ? 'textarea' : 'input') as any;
  return (
    <div className="kk-field">
      <label htmlFor={inputId} className="kk-label">{label}</label>
      <Field id={inputId} className={['kk-input', className].filter(Boolean).join(' ')} aria-describedby={describedBy} aria-invalid={error ? 'true' : undefined} {...rest} />
      {help ? <div id={inputId + '-help'} className="kk-help">{help}</div> : null}
      {error ? <div id={inputId + '-err'} className="kk-error" role="alert">{error}</div> : null}
    </div>
  );
}
export default KkInput;
