// KK-UI-GOVERNOR generated (premium / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React from 'react';
export type KkSidebarItem = { href: string; label: React.ReactNode; current?: boolean; icon?: React.ReactNode };
export type KkSidebarProps = { items: KkSidebarItem[]; title?: React.ReactNode; children?: React.ReactNode; LinkComponent?: React.ComponentType<any> };
/** Sidebar layout: persistent at ≥1024px, stacks above content below that (foldables/phones). */
export function KkSidebarLayout({ items, title, children, LinkComponent }: KkSidebarProps) {
  const Link = (LinkComponent || 'a') as any;
  return (
    <div className="kk-layout">
      <aside className="kk-sidebar" aria-label="Sidebar">
        {title ? <div className="kk-display" style={{ fontWeight: 700, padding: 'var(--kk-space-3)' }}>{title}</div> : null}
        <nav aria-label="Sections">{items.map((it) => <Link key={it.href} href={it.href} aria-current={it.current ? 'page' : undefined}>{it.icon}{it.label}</Link>)}</nav>
      </aside>
      <main className="kk-main kk-container">{children}</main>
    </div>
  );
}
export default KkSidebarLayout;
