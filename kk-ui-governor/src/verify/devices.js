// Device / condition matrix for verification. Every entry is a Playwright context recipe.
// Widths cover 240px (feature phones / smallest legacy) to 3840px (4K), foldables at their
// closed/open widths, phone landscape, DPR 1–3, light/dark, forced-colors, reduced-motion,
// 200% font scaling and a simulated low-end device.
export const SWEEP_WIDTHS = [240, 280, 320, 360, 375, 390, 412, 428, 480, 540, 600, 653, 717, 768, 820, 912, 1024, 1180, 1280, 1366, 1440, 1536, 1680, 1920, 2560, 3440, 3840];

const D = (label, width, height, opts = {}) => ({ label, width, height, dpr: 1, colorScheme: 'light', reducedMotion: 'no-preference', forcedColors: 'none', isMobile: false, hasTouch: false, flags: [], deep: false, ...opts });

export const DEVICES = {
  // phones (portrait) — deep checks
  'phone-360': D('Phone 360 portrait', 360, 780, { dpr: 3, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'portrait'] }),
  'phone-390': D('Phone 390 portrait (iPhone class)', 390, 844, { dpr: 3, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'portrait'] }),
  'phone-412': D('Phone 412 portrait (Pixel class)', 412, 915, { dpr: 2.625, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'portrait'] }),
  'phone-landscape': D('Phone landscape 844×390', 844, 390, { dpr: 3, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'landscape'] }),
  'phone-240': D('Feature phone 240', 240, 320, { dpr: 1, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'portrait', 'min-width'] }),
  // foldables
  'fold-closed': D('Foldable closed 280×653', 280, 653, { dpr: 3, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'foldable', 'closed'] }),
  'fold-open': D('Foldable open 717×512', 717, 512, { dpr: 2, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'foldable', 'open'] }),
  'surface-duo': D('Dual-screen 1114×705', 1114, 705, { dpr: 2, isMobile: true, hasTouch: true, deep: false, flags: ['touch', 'foldable', 'dual'] }),
  // tablets
  'tablet-768': D('Tablet 768 portrait', 768, 1024, { dpr: 2, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'portrait'] }),
  'tablet-1024': D('Tablet 1024 landscape', 1024, 768, { dpr: 2, isMobile: true, hasTouch: true, deep: true, flags: ['touch', 'landscape'] }),
  // laptop / desktop
  'laptop-1280': D('Laptop 1280', 1280, 800, { dpr: 1, deep: true, flags: ['desktop'] }),
  'laptop-1440-hidpi': D('Laptop 1440 @2x', 1440, 900, { dpr: 2, deep: true, flags: ['desktop', 'hidpi'] }),
  'desktop-1920': D('Desktop 1920', 1920, 1080, { dpr: 1, deep: true, flags: ['desktop'] }),
  'ultrawide-3440': D('Ultrawide 3440', 3440, 1440, { dpr: 1, deep: true, flags: ['desktop', 'ultrawide'] }),
  '4k-3840': D('4K 3840', 3840, 2160, { dpr: 1, deep: true, flags: ['desktop', '4k'] }),
  '4k-3840-hidpi': D('4K 3840 @2x', 3840, 2160, { dpr: 2, deep: false, flags: ['desktop', '4k', 'hidpi'] }),
  // conditions
  'dark-phone': D('Dark scheme phone 390', 390, 844, { dpr: 3, isMobile: true, hasTouch: true, colorScheme: 'dark', deep: true, flags: ['touch', 'dark'] }),
  'dark-desktop': D('Dark scheme desktop 1280', 1280, 800, { colorScheme: 'dark', deep: true, flags: ['desktop', 'dark'] }),
  'forced-colors': D('Forced colors (Windows HC) 1280', 1280, 800, { forcedColors: 'active', colorScheme: 'dark', deep: true, flags: ['forced-colors'] }),
  'reduced-motion-phone': D('Reduced motion phone 390', 390, 844, { dpr: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce', deep: true, flags: ['touch', 'reduced-motion'] }),
  'reduced-motion-desktop': D('Reduced motion desktop 1280', 1280, 800, { reducedMotion: 'reduce', deep: true, flags: ['reduced-motion'] }),
  'font-200-phone': D('200% font scaling phone 360', 360, 780, { dpr: 3, isMobile: true, hasTouch: true, fontScale: 2, deep: true, flags: ['touch', 'font-200'] }),
  'font-200-desktop': D('200% font scaling desktop 1280', 1280, 800, { fontScale: 2, deep: true, flags: ['font-200'] }),
  'low-end-phone': D('Low-end phone 360 (2 cores, 2GB, save-data)', 360, 780, { dpr: 2, isMobile: true, hasTouch: true, lowEnd: true, deep: true, flags: ['touch', 'low-end'] }),
};

export function planDevices(mode = 'standard') {
  const all = Object.entries(DEVICES).map(([id, d]) => ({ id, ...d }));
  const sweep = (widths) => widths.map((w) => ({ id: `sweep-${w}`, ...D(`Sweep ${w}px`, w, w < 700 ? 800 : 900, { isMobile: w < 700, hasTouch: w < 1024, dpr: 1, deep: false, flags: ['sweep'] }) }));
  if (mode === 'quick') {
    const ids = ['phone-390', 'tablet-768', 'laptop-1280', 'dark-desktop', 'reduced-motion-phone', 'font-200-phone', 'forced-colors', 'fold-closed', '4k-3840'];
    return [...all.filter((d) => ids.includes(d.id)), ...sweep([240, 320, 480, 653, 1024, 1920, 2560, 3840])];
  }
  if (mode === 'full') return [...all, ...sweep(SWEEP_WIDTHS)];
  // standard
  const ids = ['phone-240', 'phone-360', 'phone-390', 'phone-412', 'phone-landscape', 'fold-closed', 'fold-open', 'tablet-768', 'tablet-1024', 'laptop-1280', 'laptop-1440-hidpi', 'desktop-1920', 'ultrawide-3440', '4k-3840', 'dark-phone', 'dark-desktop', 'forced-colors', 'reduced-motion-phone', 'reduced-motion-desktop', 'font-200-phone', 'font-200-desktop', 'low-end-phone'];
  return [...all.filter((d) => ids.includes(d.id)), ...sweep(SWEEP_WIDTHS.filter((w) => ![360, 390, 412, 768, 1024, 1280, 1920, 3840].includes(w)))];
}
