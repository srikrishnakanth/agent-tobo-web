// KK-UI-GOVERNOR generated (premium / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React, { useRef } from 'react';
export type KkCarouselProps = { label: string; children: React.ReactNode; controls?: boolean };
/** Scroll-snap carousel: native scrolling, keyboard arrows, optional buttons. No dependency. */
export function KkCarousel({ label, children, controls = true }: KkCarouselProps) {
  const ref = useRef<HTMLDivElement>(null);
  const step = (dir: number) => { const c = ref.current; if (!c) return; const first = c.firstElementChild as HTMLElement | null; const w = (first ? first.getBoundingClientRect().width : c.clientWidth * 0.8) + 16; c.scrollBy({ left: dir * w, behavior: document.documentElement.dataset.kkMotion === 'off' ? 'auto' : 'smooth' }); };
  return (
    <div>
      <div ref={ref} className="kk-carousel" role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } }}>{children}</div>
      {controls ? <div className="kk-carousel__controls"><button type="button" className="kk-btn kk-btn--secondary kk-btn--icon" aria-label="Previous" onClick={() => step(-1)}>‹</button><button type="button" className="kk-btn kk-btn--secondary kk-btn--icon" aria-label="Next" onClick={() => step(1)}>›</button></div> : null}
    </div>
  );
}
export default KkCarousel;
