// Colour utilities: parsing, HSL conversion, WCAG 2.x contrast, accessible palette derivation.
export function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  let m;
  if ((m = /^#([0-9a-f]{3,4})$/.exec(s))) {
    const h = m[1];
    const r = parseInt(h[0] + h[0], 16), g = parseInt(h[1] + h[1], 16), b = parseInt(h[2] + h[2], 16);
    const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
    return { r, g, b, a };
  }
  if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s))) {
    const h = m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  if ((m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(s))) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(s))) {
    const { r, g, b } = hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r, g, b, a };
  }
  const named = { white: '#ffffff', black: '#000000', transparent: null, red: '#ff0000', blue: '#0000ff', green: '#008000', gray: '#808080', grey: '#808080', silver: '#c0c0c0', navy: '#000080', teal: '#008080', orange: '#ffa500', purple: '#800080', yellow: '#ffff00' };
  if (s in named) return named[s] ? parseColor(named[s]) : { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

export function toHex({ r, g, b }) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function hsl(h, s, l) { return toHex(hslToRgb(h, s, l)); }

export function luminance({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a, b) {
  const ca = typeof a === 'string' ? parseColor(a) : a;
  const cb = typeof b === 'string' ? parseColor(b) : b;
  if (!ca || !cb) return null;
  const l1 = luminance(ca), l2 = luminance(cb);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-composite fg over bg. */
export function composite(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

/** Adjust lightness of `color` until contrast against `bg` >= target (keeps hue/saturation). */
export function ensureContrast(color, bg, target = 4.5, { direction = 'auto' } = {}) {
  const c = parseColor(color), b = parseColor(bg);
  if (!c || !b) return color;
  if (contrastRatio(c, b) >= target) return toHex(c);
  const { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  const bgL = luminance(b);
  const dir = direction === 'auto' ? (bgL > 0.4 ? -1 : 1) : (direction === 'darker' ? -1 : 1);
  for (let i = 1; i <= 40; i++) {
    const nl = Math.max(0, Math.min(1, l + dir * i * 0.025));
    const cand = hslToRgb(h, s, nl);
    if (contrastRatio(cand, b) >= target) return toHex(cand);
  }
  return dir < 0 ? '#000000' : '#ffffff';
}

export function isLight(color) { const c = parseColor(color); return c ? luminance(c) > 0.45 : true; }

export function mix(a, b, t) {
  const ca = parseColor(a), cb = parseColor(b);
  return toHex({ r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t });
}

/** 12-step tonal scale from a seed hue (Radix-like intent): 1 = near-bg, 12 = high-contrast text. */
export function scale(seedHex, { dark = false, neutral = false } = {}) {
  const c = parseColor(seedHex);
  const { h, s } = rgbToHsl(c.r, c.g, c.b);
  const sat = neutral ? Math.min(s, 0.12) : s;
  const lightSteps = [0.99, 0.975, 0.95, 0.92, 0.88, 0.83, 0.76, 0.66, 0.53, 0.48, 0.40, 0.18];
  const darkSteps = [0.07, 0.09, 0.12, 0.15, 0.18, 0.22, 0.28, 0.36, 0.53, 0.58, 0.72, 0.93];
  const steps = dark ? darkSteps : lightSteps;
  return steps.map((l, i) => {
    const sAdj = neutral ? sat : (i < 2 ? sat * 0.6 : i > 9 ? sat * 0.8 : sat);
    return hsl(h, sAdj, l);
  });
}

export function hueOf(hex) { const c = parseColor(hex); return c ? rgbToHsl(c.r, c.g, c.b).h : 0; }
export function saturationOf(hex) { const c = parseColor(hex); return c ? rgbToHsl(c.r, c.g, c.b).s : 0; }
export function lightnessOf(hex) { const c = parseColor(hex); return c ? rgbToHsl(c.r, c.g, c.b).l : 0; }
export function rotate(hex, deg) { const c = parseColor(hex); const { h, s, l } = rgbToHsl(c.r, c.g, c.b); return hsl(h + deg, s, l); }
export function withLightness(hex, l) { const c = parseColor(hex); const { h, s } = rgbToHsl(c.r, c.g, c.b); return hsl(h, s, l); }
export function withSaturation(hex, s) { const c = parseColor(hex); const { h, l } = rgbToHsl(c.r, c.g, c.b); return hsl(h, s, l); }
