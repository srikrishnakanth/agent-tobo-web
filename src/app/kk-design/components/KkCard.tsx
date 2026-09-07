// KK-UI-GOVERNOR generated (modern / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React from 'react';
export type KkCardProps = React.HTMLAttributes<HTMLElement> & { title?: React.ReactNode; meta?: React.ReactNode; elevated?: boolean; as?: 'article' | 'section' | 'div' };
export function KkCard({ title, meta, elevated = false, as = 'article', className = '', children, ...rest }: KkCardProps) {
  const Tag = as as any;
  return (
    <Tag className={['kk-card', elevated ? 'kk-card--elevated' : '', className].filter(Boolean).join(' ')} {...rest}>
      {title ? <h3 className="kk-card__title">{title}</h3> : null}
      {meta ? <div className="kk-card__meta">{meta}</div> : null}
      {children}
    </Tag>
  );
}
export default KkCard;
