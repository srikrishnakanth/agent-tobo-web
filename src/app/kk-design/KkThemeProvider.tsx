'use client';
// KK-UI-GOVERNOR generated (premium / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { initKkMotion, kkTheme } from './motion.js';
export type KkTheme = 'auto' | 'light' | 'dark' | 'high-contrast';
type Ctx = { theme: KkTheme; setTheme: (t: KkTheme) => void; motion: string; threeD: string };
const KkCtx = createContext<Ctx>({ theme: 'auto', setTheme: () => {}, motion: 'full', threeD: 'off' });
/** Wrap your app once (client side). Initialises the motion runtime and exposes theme controls. Works without it too: CSS handles light/dark/contrast/reduced-motion on its own. */
export function KkThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<KkTheme>('auto');
  const [mode, setMode] = useState({ motion: 'full', threeD: 'off' });
  useEffect(() => {
    const r = initKkMotion();
    if (r) setMode({ motion: r.motion, threeD: r.threeD });
    setThemeState(kkTheme.get() as KkTheme);
    const onMode = (e: Event) => setMode((e as CustomEvent).detail);
    document.documentElement.addEventListener('kk:mode', onMode);
    return () => document.documentElement.removeEventListener('kk:mode', onMode);
  }, []);
  const setTheme = (t: KkTheme) => { kkTheme.set(t); setThemeState(t); };
  return <KkCtx.Provider value={{ theme, setTheme, motion: mode.motion, threeD: mode.threeD }}>{children}</KkCtx.Provider>;
}
export function useKkTheme() { return useContext(KkCtx); }
export function KkThemeToggle() {
  const { theme, setTheme } = useKkTheme();
  return (
    <div className="kk-cluster" role="group" aria-label="Theme">
      {(['auto', 'light', 'dark', 'high-contrast'] as KkTheme[]).map((t) => <button key={t} type="button" className={'kk-btn kk-btn--sm ' + (theme === t ? '' : 'kk-btn--secondary')} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>)}
    </div>
  );
}
export default KkThemeProvider;
