// React component emitter: dependency-free components adapted from vault design intent
// (shadcn/Radix-style APIs converted to native elements so no new dependency is ever required).
export function emitReactComponents(tokens, selection, { ts = true, hasRecharts = false, hasThree = false } = {}) {
  const x = ts ? 'tsx' : 'jsx';
  const T = (s) => (ts ? s : '');
  const files = {};
  files[`components/KkButton.${x}`] = `import React from 'react';
${T(`export type KkButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: boolean };`)}
export function KkButton({ variant = 'primary', size = 'md', icon = false, className = '', type = 'button', ...rest }${T(': KkButtonProps')}) {
  const cls = ['kk-btn', variant !== 'primary' ? 'kk-btn--' + variant : '', size !== 'md' ? 'kk-btn--' + size : '', icon ? 'kk-btn--icon' : '', className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}
export default KkButton;
`;
  files[`components/KkCard.${x}`] = `import React from 'react';
${T(`export type KkCardProps = React.HTMLAttributes<HTMLElement> & { title?: React.ReactNode; meta?: React.ReactNode; elevated?: boolean; as?: 'article' | 'section' | 'div' };`)}
export function KkCard({ title, meta, elevated = false, as = 'article', className = '', children, ...rest }${T(': KkCardProps')}) {
  const Tag = as${T(' as any')};
  return (
    <Tag className={['kk-card', elevated ? 'kk-card--elevated' : '', className].filter(Boolean).join(' ')} {...rest}>
      {title ? <h3 className="kk-card__title">{title}</h3> : null}
      {meta ? <div className="kk-card__meta">{meta}</div> : null}
      {children}
    </Tag>
  );
}
export default KkCard;
`;
  files[`components/KkInput.${x}`] = `import React, { useId } from 'react';
${T(`export type KkInputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; help?: React.ReactNode; error?: React.ReactNode; textarea?: boolean };`)}
export function KkInput({ label, help, error, textarea = false, id, className = '', ...rest }${T(': KkInputProps')}) {
  const auto = useId();
  const inputId = id || auto;
  const describedBy = [help ? inputId + '-help' : null, error ? inputId + '-err' : null].filter(Boolean).join(' ') || undefined;
  const Field = (textarea ? 'textarea' : 'input')${T(' as any')};
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
`;
  files[`components/KkModal.${x}`] = `import React, { useEffect, useRef } from 'react';
${T(`export type KkModalProps = { open: boolean; onClose: () => void; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode };`)}
/** Native <dialog>: focus trap, Escape, aria-modal and backdrop for free; no dependency. */
export function KkModal({ open, onClose, title, children, actions }${T(': KkModalProps')}) {
  const ref = useRef${T('<HTMLDialogElement>')}(null);
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
`;
  files[`components/KkTable.${x}`] = `import React from 'react';
${T(`export type KkColumn<Row> = { key: keyof Row & string; header: React.ReactNode; numeric?: boolean; wrap?: boolean; render?: (row: Row) => React.ReactNode };
export type KkTableProps<Row> = { columns: KkColumn<Row>[]; rows: Row[]; caption?: React.ReactNode; rowKey?: (row: Row, i: number) => React.Key };`)}
export function KkTable${T('<Row extends Record<string, any>>')}({ columns, rows, caption, rowKey }${T(': KkTableProps<Row>')}) {
  return (
    <div className="kk-table-wrap" role="region" aria-label={typeof caption === 'string' ? caption : 'Data table'} tabIndex={0}>
      <table className="kk-table">
        {caption ? <caption className="kk-help" style={{ textAlign: 'left', padding: '8px 12px' }}>{caption}</caption> : null}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={[c.numeric ? 'kk-num' : '', c.wrap ? 'kk-wrap' : ''].filter(Boolean).join(' ') || undefined}>{c.header}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={rowKey ? rowKey(r, i) : i}>{columns.map((c) => <td key={c.key} className={[c.numeric ? 'kk-num' : '', c.wrap ? 'kk-wrap' : ''].filter(Boolean).join(' ') || undefined}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
export default KkTable;
`;
  files[`components/KkNav.${x}`] = `import React from 'react';
${T(`export type KkNavItem = { href: string; label: React.ReactNode; current?: boolean; icon?: React.ReactNode };
export type KkNavProps = { items: KkNavItem[]; brand?: React.ReactNode; sticky?: boolean; end?: React.ReactNode; LinkComponent?: React.ComponentType<any> };`)}
export function KkNav({ items, brand, sticky = true, end, LinkComponent }${T(': KkNavProps')}) {
  const Link = (LinkComponent || 'a')${T(' as any')};
  return (
    <nav className={['kk-nav', sticky ? 'kk-nav--sticky' : ''].filter(Boolean).join(' ')} aria-label="Primary">
      {brand ? <div className="kk-display" style={{ fontWeight: 700, marginRight: 'auto', paddingInline: 'var(--kk-space-3)' }}>{brand}</div> : null}
      {items.map((it) => <Link key={it.href} href={it.href} aria-current={it.current ? 'page' : undefined}>{it.icon}{it.label}</Link>)}
      {end}
    </nav>
  );
}
export default KkNav;
`;
  files[`components/KkSidebar.${x}`] = `import React from 'react';
${T(`export type KkSidebarItem = { href: string; label: React.ReactNode; current?: boolean; icon?: React.ReactNode };
export type KkSidebarProps = { items: KkSidebarItem[]; title?: React.ReactNode; children?: React.ReactNode; LinkComponent?: React.ComponentType<any> };`)}
/** Sidebar layout: persistent at ≥1024px, stacks above content below that (foldables/phones). */
export function KkSidebarLayout({ items, title, children, LinkComponent }${T(': KkSidebarProps')}) {
  const Link = (LinkComponent || 'a')${T(' as any')};
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
`;
  files[`components/KkChart.${x}`] = `import React from 'react';
${T(`export type KkPoint = { label: string; value: number };
export type KkChartProps = { data: KkPoint[]; title: string; kind?: 'bar' | 'line'; height?: number; formatValue?: (v: number) => string };`)}
/** Dependency-free SVG bar/line chart with an accessible data table fallback.${hasRecharts ? ' (recharts is present in this project; use it for interactive charts and keep this for lightweight stats.)' : ''} */
export function KkChart({ data, title, kind = 'bar', height = 200, formatValue = (v) => String(v) }${T(': KkChartProps')}) {
  const w = 600, h = height, pad = 28;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = data.length ? (w - pad * 2) / data.length : 0;
  const pts = data.map((d, i) => [pad + i * bw + bw / 2, h - pad - (d.value / max) * (h - pad * 2)]);
  return (
    <figure style={{ margin: 0 }}>
      <svg className="kk-chart" viewBox={'0 0 ' + w + ' ' + h} role="img" aria-labelledby="kk-chart-title" preserveAspectRatio="xMidYMid meet">
        <title id="kk-chart-title">{title}</title>
        <line className="kk-chart__axis" x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
        {kind === 'bar' ? data.map((d, i) => <rect key={d.label} className="kk-chart__bar" x={pad + i * bw + bw * 0.15} y={pts[i][1]} width={bw * 0.7} height={h - pad - pts[i][1]} rx={3}><title>{d.label + ': ' + formatValue(d.value)}</title></rect>)
          : <><polygon className="kk-chart__area" points={[[pad, h - pad], ...pts, [w - pad, h - pad]].map((p) => p.join(',')).join(' ')} /><polyline className="kk-chart__line" points={pts.map((p) => p.join(',')).join(' ')} /></>}
        {data.map((d, i) => <text key={d.label} className="kk-chart__label" x={pts[i][0]} y={h - pad + 16} textAnchor="middle">{d.label}</text>)}
      </svg>
      <figcaption className="kk-help">{title}</figcaption>
      <table className="kk-table" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}><caption>{title}</caption><tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th><td>{formatValue(d.value)}</td></tr>)}</tbody></table>
    </figure>
  );
}
export default KkChart;
`;
  files[`components/KkCarousel.${x}`] = `import React, { useRef } from 'react';
${T(`export type KkCarouselProps = { label: string; children: React.ReactNode; controls?: boolean };`)}
/** Scroll-snap carousel: native scrolling, keyboard arrows, optional buttons. No dependency. */
export function KkCarousel({ label, children, controls = true }${T(': KkCarouselProps')}) {
  const ref = useRef${T('<HTMLDivElement>')}(null);
  const step = (dir${T(': number')}) => { const c = ref.current; if (!c) return; const first = c.firstElementChild${T(' as HTMLElement | null')}; const w = (first ? first.getBoundingClientRect().width : c.clientWidth * 0.8) + 16; c.scrollBy({ left: dir * w, behavior: document.documentElement.dataset.kkMotion === 'off' ? 'auto' : 'smooth' }); };
  return (
    <div>
      <div ref={ref} className="kk-carousel" role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } }}>{children}</div>
      {controls ? <div className="kk-carousel__controls"><button type="button" className="kk-btn kk-btn--secondary kk-btn--icon" aria-label="Previous" onClick={() => step(-1)}>‹</button><button type="button" className="kk-btn kk-btn--secondary kk-btn--icon" aria-label="Next" onClick={() => step(1)}>›</button></div> : null}
    </div>
  );
}
export default KkCarousel;
`;
  files[`KkThemeProvider.${x}`] = `import React, { createContext, useContext, useEffect, useState } from 'react';
import { initKkMotion, kkTheme } from './motion.js';
${T(`export type KkTheme = 'auto' | 'light' | 'dark' | 'high-contrast';
type Ctx = { theme: KkTheme; setTheme: (t: KkTheme) => void; motion: string; threeD: string };`)}
const KkCtx = createContext${T('<Ctx>')}({ theme: 'auto', setTheme: () => {}, motion: 'full', threeD: 'off' });
/** Wrap your app once (client side). Initialises the motion runtime and exposes theme controls. Works without it too: CSS handles light/dark/contrast/reduced-motion on its own. */
export function KkThemeProvider({ children }${T(': { children: React.ReactNode }')}) {
  const [theme, setThemeState] = useState${T('<KkTheme>')}('auto');
  const [mode, setMode] = useState({ motion: 'full', threeD: 'off' });
  useEffect(() => {
    const r = initKkMotion();
    if (r) setMode({ motion: r.motion, threeD: r.threeD });
    setThemeState(kkTheme.get()${T(' as KkTheme')});
    const onMode = (e${T(': Event')}) => setMode((e${T(' as CustomEvent')}).detail);
    document.documentElement.addEventListener('kk:mode', onMode);
    return () => document.documentElement.removeEventListener('kk:mode', onMode);
  }, []);
  const setTheme = (t${T(': KkTheme')}) => { kkTheme.set(t); setThemeState(t); };
  return <KkCtx.Provider value={{ theme, setTheme, motion: mode.motion, threeD: mode.threeD }}>{children}</KkCtx.Provider>;
}
export function useKkTheme() { return useContext(KkCtx); }
export function KkThemeToggle() {
  const { theme, setTheme } = useKkTheme();
  return (
    <div className="kk-cluster" role="group" aria-label="Theme">
      {(['auto', 'light', 'dark', 'high-contrast']${T(' as KkTheme[]')}).map((t) => <button key={t} type="button" className={'kk-btn kk-btn--sm ' + (theme === t ? '' : 'kk-btn--secondary')} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>)}
    </div>
  );
}
export default KkThemeProvider;
`;
  files[`index.${ts ? 'ts' : 'js'}`] = `// KK-UI-GOVERNOR design system entry. Import './theme.css' once (done by the governor) and use these components anywhere.
export { KkButton } from './components/KkButton${ts ? '' : '.jsx'}';
export { KkCard } from './components/KkCard${ts ? '' : '.jsx'}';
export { KkInput } from './components/KkInput${ts ? '' : '.jsx'}';
export { KkModal } from './components/KkModal${ts ? '' : '.jsx'}';
export { KkTable } from './components/KkTable${ts ? '' : '.jsx'}';
export { KkNav } from './components/KkNav${ts ? '' : '.jsx'}';
export { KkSidebarLayout } from './components/KkSidebar${ts ? '' : '.jsx'}';
export { KkChart } from './components/KkChart${ts ? '' : '.jsx'}';
export { KkCarousel } from './components/KkCarousel${ts ? '' : '.jsx'}';
export { KkThemeProvider, KkThemeToggle, useKkTheme } from './KkThemeProvider${ts ? '' : '.jsx'}';
export { initKkMotion, kkTheme } from './motion.js';
`;
  const header = `// KK-UI-GOVERNOR generated (${tokens.meta.style} / ${tokens.meta.pageType}) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.\n`;
  for (const k of Object.keys(files)) files[k] = header + files[k];
  return files;
}
