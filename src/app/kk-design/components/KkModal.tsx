'use client';
// KK-UI-GOVERNOR generated (premium / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React, { useEffect, useRef } from 'react';
export type KkModalProps = { open: boolean; onClose: () => void; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode };
/** Native <dialog>: focus trap, Escape, aria-modal and backdrop for free; no dependency. */
export function KkModal({ open, onClose, title, children, actions }: KkModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal(); else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="kk-modal" aria-labelledby="kk-modal-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <h2 id="kk-modal-title" className="kk-modal__title">{title}</h2>
      <div>{children}</div>
      <div className="kk-modal__actions">{actions ?? <button type="button" className="kk-btn kk-btn--secondary" onClick={onClose}>Close</button>}</div>
    </dialog>
  );
}
export default KkModal;
