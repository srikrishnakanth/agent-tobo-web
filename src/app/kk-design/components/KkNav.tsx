// KK-UI-GOVERNOR generated (premium / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React from 'react';
export type KkNavItem = { href: string; label: React.ReactNode; current?: boolean; icon?: React.ReactNode };
export type KkNavProps = { items: KkNavItem[]; brand?: React.ReactNode; sticky?: boolean; end?: React.ReactNode; LinkComponent?: React.ComponentType<any> };
export function KkNav({ items, brand, sticky = true, end, LinkComponent }: KkNavProps) {
  const Link = (LinkComponent || 'a') as any;
  return (
    <nav className={['kk-nav', sticky ? 'kk-nav--sticky' : ''].filter(Boolean).join(' ')} aria-label="Primary">
      {brand ? <div className="kk-display" style={{ fontWeight: 700, marginRight: 'auto', paddingInline: 'var(--kk-space-3)' }}>{brand}</div> : null}
      {items.map((it) => <Link key={it.href} href={it.href} aria-current={it.current ? 'page' : undefined}>{it.icon}{it.label}</Link>)}
      {end}
    </nav>
  );
}
export default KkNav;
