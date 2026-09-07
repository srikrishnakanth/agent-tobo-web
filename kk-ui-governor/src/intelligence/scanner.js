// Project scanner ("Inspect"): reads a frontend project and produces a structured picture of it.
// Pure analysis: never writes to the project.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { walk, readJson, exists, relPosix, hashFile } from '../core/fsutil.js';
import { parseColor, toHex, saturationOf, lightnessOf, luminance } from './color.js';
import { PAGE_TYPES } from './data/presets.js';

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.mdx', '.md']);
const STYLE_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const MARKUP_EXT = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro', '.mdx']);
const MAX_FILE_BYTES = 600 * 1024;

export async function scanProject(root, { logger, maxFiles = 4000 } = {}) {
  root = path.resolve(root);
  const started = Date.now();
  const pkg = await readJson(path.join(root, 'package.json'), null);
  const allFiles = await walk(root, { maxFiles, extensions: CODE_EXT });
  const files = [];
  for (const f of allFiles) {
    let stat; try { stat = await fsp.stat(f); } catch { continue; }
    if (stat.size > MAX_FILE_BYTES) continue;
    const rel = relPosix(root, f);
    if (rel.includes('/.kk-governor/') || rel.startsWith('.kk-governor/') || rel.startsWith('DESIGN-VAULT/')) continue;
    const content = await fsp.readFile(f, 'utf8').catch(() => '');
    files.push({ abs: f, rel, ext: path.extname(f).toLowerCase(), content, size: stat.size });
  }
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const framework = await detectFramework(root, pkg, deps, files);
  const cssStack = detectCssStack(root, deps, files);
  const components = detectComponents(files, framework);
  const colors = detectColors(files);
  const brand = await detectBrand(root, pkg, files, colors, framework);
  const typography = detectTypography(files, deps);
  const layout = detectLayout(files, cssStack);
  const pages = await detectPages(root, framework, files);
  const pageTypes = detectPageTypes(pages, files, pkg);
  const responsive = detectResponsive(files, framework, layout);
  const uxProblems = detectUxProblems(files, framework, typography, layout);
  const genericPatterns = detectGenericPatterns(files, typography, colors);
  const entryPoints = await detectEntryPoints(root, framework, files);
  const hashes = {};
  for (const e of [...entryPoints.styles, ...entryPoints.layouts, ...entryPoints.html]) hashes[e] = await hashFile(path.join(root, e));
  const scan = {
    root, name: pkg?.name || path.basename(root), scannedAt: new Date().toISOString(), durationMs: Date.now() - started,
    packageJson: pkg ? { name: pkg.name, version: pkg.version, dependencies: pkg.dependencies || {}, devDependencies: pkg.devDependencies || {}, scripts: pkg.scripts || {}, type: pkg.type } : null,
    fileCount: files.length, framework, cssStack, components, brand, colors, typography, layout, pages, pageTypes, responsive, uxProblems, genericPatterns, entryPoints, entryHashes: hashes,
  };
  logger?.info(`scan: ${framework.name}${framework.version ? '@' + framework.version : ''}, css=[${cssStack.map((c) => c.name).join(',')}], ${pages.length} page(s), ${uxProblems.length} UX problem(s), ${genericPatterns.length} generic pattern(s)`);
  return scan;
}

// ----------------------------------------------------------------------------- framework
export async function detectFramework(root, pkg, deps, files) {
  const has = (d) => Object.prototype.hasOwnProperty.call(deps, d);
  const ver = (d) => (deps[d] || '').replace(/^[\^~>=<\s]+/, '') || null;
  const dirExists = async (...p) => { for (const x of p) if (await exists(path.join(root, x))) return x; return null; };
  if (has('next')) {
    const appDir = await dirExists('app', 'src/app');
    const pagesDir = await dirExists('pages', 'src/pages');
    return { name: 'nextjs', version: ver('next'), router: appDir ? 'app' : pagesDir ? 'pages' : 'unknown', appDir, pagesDir, language: has('typescript') ? 'ts' : 'js', supported: true, family: 'react' };
  }
  if (has('nuxt') || has('nuxt3')) return { name: 'nuxt', version: ver('nuxt'), supported: false, family: 'vue', reason: 'Nuxt adapter not available; tokens-only candidate offered' };
  if (has('@angular/core')) return { name: 'angular', version: ver('@angular/core'), supported: false, family: 'angular', reason: 'Angular adapter not available; tokens-only candidate offered' };
  if (has('@sveltejs/kit') || has('svelte')) return { name: has('@sveltejs/kit') ? 'sveltekit' : 'svelte', version: ver('svelte'), supported: false, family: 'svelte', reason: 'Svelte adapter not available; tokens-only candidate offered' };
  if (has('astro')) return { name: 'astro', version: ver('astro'), supported: false, family: 'astro', reason: 'Astro adapter not available; tokens-only candidate offered' };
  if (has('vue')) return { name: 'vue', version: ver('vue'), supported: false, family: 'vue', reason: 'Vue adapter not available; tokens-only candidate offered' };
  if (has('@remix-run/react')) return { name: 'remix', version: ver('@remix-run/react'), supported: false, family: 'react', reason: 'Remix adapter not available; React tokens candidate offered' };
  if (has('solid-js')) return { name: 'solid', version: ver('solid-js'), supported: false, family: 'solid', reason: 'Solid adapter not available' };
  if (has('react')) {
    const bundler = has('vite') ? 'vite' : has('react-scripts') ? 'cra' : has('webpack') ? 'webpack' : has('parcel') ? 'parcel' : 'unknown';
    return { name: 'react', version: ver('react'), bundler, language: has('typescript') ? 'ts' : 'js', supported: true, family: 'react' };
  }
  const htmlFiles = files.filter((f) => f.ext === '.html' || f.ext === '.htm');
  if (htmlFiles.length) return { name: 'html', version: null, supported: true, family: 'html', htmlFiles: htmlFiles.length, hasVite: has('vite') };
  if (pkg) return { name: 'unknown', version: null, supported: false, family: 'unknown', reason: 'no recognised frontend framework or HTML entry found' };
  return { name: 'unknown', version: null, supported: false, family: 'unknown', reason: 'no package.json and no HTML files' };
}

// ----------------------------------------------------------------------------- css stack
export function detectCssStack(root, deps, files) {
  const has = (d) => Object.prototype.hasOwnProperty.call(deps, d);
  const out = [];
  const styles = files.filter((f) => STYLE_EXT.has(f.ext));
  const allText = files.map((f) => f.content).join('\n');
  if (has('tailwindcss') || /@import\s+["']tailwindcss["']|@tailwind\s+base/.test(allText)) {
    const v4 = /@import\s+["']tailwindcss["']|@theme\s*\{/.test(allText) || /^4|^\^4/.test(deps.tailwindcss || '');
    const configFile = files.find((f) => /tailwind\.config\.(js|cjs|mjs|ts)$/.test(f.rel));
    out.push({ name: 'tailwind', version: v4 ? '4' : '3', configFile: configFile?.rel || null, globalsFile: files.find((f) => STYLE_EXT.has(f.ext) && /@import\s+["']tailwindcss["']|@tailwind\s+base/.test(f.content))?.rel || null });
  }
  if (has('sass') || has('node-sass') || styles.some((f) => f.ext === '.scss' || f.ext === '.sass')) out.push({ name: 'sass' });
  if (has('less')) out.push({ name: 'less' });
  if (has('styled-components')) out.push({ name: 'styled-components' });
  if (has('@emotion/react') || has('@emotion/styled')) out.push({ name: 'emotion' });
  if (styles.some((f) => /\.module\.(css|scss)$/.test(f.rel))) out.push({ name: 'css-modules' });
  if (has('bootstrap')) out.push({ name: 'bootstrap' });
  if (has('@mui/material')) out.push({ name: 'mui' });
  if (has('@chakra-ui/react')) out.push({ name: 'chakra' });
  if (has('@mantine/core')) out.push({ name: 'mantine' });
  if (has('antd')) out.push({ name: 'antd' });
  if (has('daisyui')) out.push({ name: 'daisyui' });
  if (files.some((f) => f.rel === 'components.json') || files.some((f) => /components\/ui\/.+\.tsx$/.test(f.rel))) out.push({ name: 'shadcn' });
  if (Object.keys(deps).some((d) => d.startsWith('@radix-ui/'))) out.push({ name: 'radix' });
  if (has('framer-motion') || has('motion')) out.push({ name: 'motion' });
  if (has('gsap')) out.push({ name: 'gsap' });
  if (has('three') || has('@react-three/fiber')) out.push({ name: 'three' });
  if (has('recharts') || has('chart.js') || has('d3') || has('echarts')) out.push({ name: 'charts', libs: ['recharts', 'chart.js', 'd3', 'echarts'].filter(has) });
  if (has('swiper') || has('embla-carousel-react')) out.push({ name: 'carousel', libs: ['swiper', 'embla-carousel-react'].filter(has) });
  if (!out.some((s) => ['tailwind', 'bootstrap', 'mui', 'chakra', 'mantine', 'antd'].includes(s.name))) out.push({ name: 'plain-css', files: styles.length });
  return out;
}

// ----------------------------------------------------------------------------- components
const COMPONENT_KINDS = {
  button: /button|btn|cta/i, input: /input|field|textfield|textarea|select|checkbox|radio|switch|toggle|form/i, card: /card|tile|panel/i, table: /table|grid|datagrid|list/i,
  navigation: /nav|navbar|header|menu|breadcrumb|tabs/i, sidebar: /sidebar|drawer|aside|sidenav/i, modal: /modal|dialog|sheet|popover|drawer/i, chart: /chart|graph|sparkline|plot/i,
  carousel: /carousel|slider|swiper|slideshow/i, hero: /hero|banner|jumbotron/i, footer: /footer/i, badge: /badge|chip|tag|pill/i, avatar: /avatar/i, toast: /toast|snackbar|alert|notification/i,
};
export function detectComponents(files, framework) {
  const found = [];
  const summary = {};
  for (const f of files) {
    if (['.jsx', '.tsx', '.js', '.ts', '.vue', '.svelte'].includes(f.ext)) {
      const re = /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/g;
      let m;
      while ((m = re.exec(f.content))) {
        const name = m[1];
        const isComponent = /<[A-Za-z]/.test(f.content) || f.ext === '.vue' || f.ext === '.svelte';
        if (!isComponent) continue;
        let kind = 'other';
        for (const [k, rx] of Object.entries(COMPONENT_KINDS)) if (rx.test(name)) { kind = k; break; }
        found.push({ name, kind, file: f.rel });
        summary[kind] = (summary[kind] || 0) + 1;
      }
    }
    if (f.ext === '.html' || f.ext === '.htm') {
      const count = (rx) => (f.content.match(rx) || []).length;
      const tags = { button: count(/<button\b/gi) + count(/<a\b[^>]*class="[^"]*btn/gi), input: count(/<(input|select|textarea)\b/gi), table: count(/<table\b/gi), navigation: count(/<nav\b/gi), sidebar: count(/<aside\b/gi), modal: count(/<dialog\b/gi) + count(/class="[^"]*modal/gi), card: count(/class="[^"]*card/gi), form: count(/<form\b/gi), hero: count(/class="[^"]*hero/gi), carousel: count(/class="[^"]*(carousel|slider|swiper)/gi) };
      for (const [k, n] of Object.entries(tags)) if (n) { summary[k] = (summary[k] || 0) + n; found.push({ name: `<${k}> ×${n}`, kind: k, file: f.rel }); }
    }
  }
  const existing = Object.keys(summary);
  return { list: found.slice(0, 400), summary, existing, hasDesignSystem: found.filter((c) => /components\/ui\//.test(c.file)).length > 5 };
}

// ----------------------------------------------------------------------------- colours
const NEUTRAL_SAT = 0.12;
export function detectColors(files) {
  const freq = new Map();
  const vars = {};
  const colorRe = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
  for (const f of files) {
    if (!STYLE_EXT.has(f.ext) && !MARKUP_EXT.has(f.ext) && !['.js', '.ts'].includes(f.ext)) continue;
    for (const m of f.content.matchAll(colorRe)) {
      const c = parseColor(m[0]);
      if (!c || c.a === 0) continue;
      const hex = toHex(c);
      freq.set(hex, (freq.get(hex) || 0) + 1);
    }
    for (const m of f.content.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
      const c = parseColor(m[2].trim());
      if (c) vars[`--${m[1]}`] = toHex(c);
    }
  }
  const all = [...freq.entries()].map(([hex, n]) => ({ hex, count: n, saturation: saturationOf(hex), lightness: lightnessOf(hex) })).sort((a, b) => b.count - a.count);
  const accents = all.filter((c) => c.saturation > NEUTRAL_SAT && c.lightness > 0.12 && c.lightness < 0.9);
  const neutrals = all.filter((c) => c.saturation <= NEUTRAL_SAT);
  const bgVarNames = ['--bg', '--background', '--bg-main', '--bg-primary', '--surface', '--color-bg', '--color-background', '--body-bg'];
  let bg = null;
  for (const n of bgVarNames) if (vars[n]) { bg = vars[n]; break; }
  if (!bg) {
    // Fallback: body background declaration
    for (const f of files) {
      const m = /body\s*{[^}]*background(?:-color)?\s*:\s*([^;}]+)/i.exec(f.content) || /html\s*,\s*body\s*{[^}]*background(?:-color)?\s*:\s*([^;}]+)/i.exec(f.content);
      if (m) { const c = parseColor(m[1].trim().split(/\s+/)[0]) || parseColor((m[1].match(colorRe) || [])[0]); if (c) { bg = toHex(c); break; } }
    }
  }
  const darkDefault = bg ? luminance(parseColor(bg)) < 0.25 : false;
  return { total: all.length, top: all.slice(0, 30), accents: accents.slice(0, 12), neutrals: neutrals.slice(0, 12), variables: vars, background: bg, darkDefault };
}

// ----------------------------------------------------------------------------- brand
export async function detectBrand(root, pkg, files, colors, framework) {
  let name = null;
  const layout = files.find((f) => /(^|\/)(layout|_app|_document|index)\.(tsx|jsx|js|html)$/.test(f.rel));
  for (const f of [layout, ...files.filter((x) => x.ext === '.html')].filter(Boolean)) {
    const m = /<title>\s*([^<]{1,80})<\/title>/i.exec(f.content) || /title\s*:\s*["'`]([^"'`]{1,80})["'`]/.exec(f.content);
    if (m) { name = m[1].trim(); break; }
  }
  if (!name && pkg?.name && !['web', 'app', 'frontend', 'client', 'my-app'].includes(pkg.name)) name = pkg.name;
  if (!name) name = path.basename(root);
  const logos = files.length ? (await walk(root, { extensions: new Set(['.svg', '.png', '.ico', '.webp']) })).map((f) => relPosix(root, f)).filter((r) => /logo|brand|icon-?\d*|favicon/i.test(r)).slice(0, 10) : [];
  // Primary colour: named variable first, then most frequent accent.
  const v = colors.variables;
  const candidates = ['--primary', '--color-primary', '--brand', '--brand-primary', '--accent', '--color-accent', '--primary-color', '--accent-color', '--color-brand'];
  let primaryColor = null, primarySource = null;
  for (const c of candidates) if (v[c]) { primaryColor = v[c]; primarySource = `css variable ${c}`; break; }
  if (!primaryColor) {
    const tw = files.find((f) => /tailwind\.config\.(js|cjs|mjs|ts)$/.test(f.rel));
    const m = tw && /primary\s*:\s*['"](#[0-9a-f]{3,8})['"]/i.exec(tw.content);
    if (m) { primaryColor = toHex(parseColor(m[1])); primarySource = 'tailwind config'; }
  }
  if (!primaryColor && colors.accents.length) { primaryColor = colors.accents[0].hex; primarySource = 'most frequent accent colour'; }
  const secondaryColor = colors.accents.find((c) => c.hex !== primaryColor)?.hex || null;
  const strength = primarySource?.startsWith('css variable') || primarySource === 'tailwind config' ? 'explicit' : primaryColor ? 'inferred' : 'none';
  return { name, logos, primaryColor, primarySource, secondaryColor, strength, darkDefault: colors.darkDefault, background: colors.background };
}

// ----------------------------------------------------------------------------- typography
export function detectTypography(files, deps) {
  const families = new Map();
  const googleFonts = new Set();
  const nextFonts = new Set();
  let baseSize = null;
  const sizes = [];
  for (const f of files) {
    for (const m of f.content.matchAll(/font-family\s*:\s*([^;}\n]+)/gi)) {
      const fam = m[1].split(',')[0].replace(/["']/g, '').trim();
      if (fam && !fam.startsWith('var(')) families.set(fam, (families.get(fam) || 0) + 1);
    }
    for (const m of f.content.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&)]+)/g)) googleFonts.add(decodeURIComponent(m[1]).split(':')[0].replace(/\+/g, ' '));
    for (const m of f.content.matchAll(/from\s+["']next\/font\/google["'][\s\S]{0,200}?\b([A-Z][A-Za-z_]+)\s*\(/g)) nextFonts.add(m[1]);
    for (const m of f.content.matchAll(/import\s*{\s*([^}]+)}\s*from\s*["']next\/font\/google["']/g)) m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => nextFonts.add(n));
    const hb = /html\s*{[^}]*font-size\s*:\s*([\d.]+)(px|%|rem)/i.exec(f.content);
    if (hb) baseSize = `${hb[1]}${hb[2]}`;
    for (const m of f.content.matchAll(/font-size\s*:\s*([\d.]+)px/gi)) sizes.push(+m[1]);
  }
  const fams = [...families.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  const primary = fams[0]?.name || null;
  const usesSystem = !primary || /system-ui|-apple-system|segoe|roboto|arial|helvetica|sans-serif/i.test(primary);
  const hasGeist = 'geist' in deps;
  return { families: fams.slice(0, 10), primary, usesSystemStack: usesSystem, googleFonts: [...googleFonts], nextFonts: [...nextFonts], hasGeistPackage: hasGeist, baseFontSize: baseSize, minFontSizePx: sizes.length ? Math.min(...sizes) : null, distinctSizes: [...new Set(sizes)].length, interDefault: /inter/i.test(primary || '') || [...nextFonts].some((n) => /^Inter/.test(n)) };
}

// ----------------------------------------------------------------------------- layout
export function detectLayout(files, cssStack) {
  const c = (rx) => files.reduce((n, f) => n + (f.content.match(rx) || []).length, 0);
  const grid = c(/display\s*:\s*grid|\bgrid-cols-|\bgrid\b(?=[^a-z-])/gi);
  const flex = c(/display\s*:\s*flex|\bflex\b(?=[^a-z-])/gi);
  const floats = c(/float\s*:\s*(left|right)/gi);
  const fixed = c(/position\s*:\s*fixed|\bfixed\b(?=[^a-z-])/gi);
  const sticky = c(/position\s*:\s*sticky|\bsticky\b(?=[^a-z-])/gi);
  const vh100 = c(/100vh|h-screen|min-h-screen/gi);
  const dvh = c(/100dvh|100svh|h-dvh|min-h-dvh/gi);
  const containerQueries = c(/@container/gi);
  const cssVars = c(/--[\w-]+\s*:/g);
  const maxWidths = [];
  for (const f of files) for (const m of f.content.matchAll(/max-width\s*:\s*([\d.]+)(px|rem)/gi)) maxWidths.push(m[2] === 'rem' ? +m[1] * 16 : +m[1]);
  const breakpoints = new Set();
  for (const f of files) for (const m of f.content.matchAll(/@media[^{]*\((?:min|max)-width\s*:\s*([\d.]+)(px|em|rem)\)/gi)) breakpoints.add(m[2] === 'px' ? +m[1] : +m[1] * 16);
  const tailwind = cssStack.some((s) => s.name === 'tailwind');
  const system = tailwind ? 'tailwind-utilities' : grid > flex ? 'css-grid' : flex > 0 ? 'flexbox' : floats > 0 ? 'floats' : 'unknown';
  return { system, counts: { grid, flex, floats, fixed, sticky, vh100, dvh, containerQueries, cssVars }, containerMaxWidths: [...new Set(maxWidths)].sort((a, b) => a - b).slice(0, 8), breakpoints: [...breakpoints].sort((a, b) => a - b), usesCssVariables: cssVars > 0 };
}

// ----------------------------------------------------------------------------- pages / routes
export async function detectPages(root, framework, files) {
  const pages = [];
  if (framework.name === 'nextjs') {
    if (framework.appDir) {
      for (const f of files) {
        const m = new RegExp(`^${escapeRe(framework.appDir)}/(.*?)(?:^|/)?page\\.(tsx|jsx|js|ts|mdx)$`).exec(f.rel) || (f.rel === `${framework.appDir}/page.tsx` || f.rel === `${framework.appDir}/page.jsx` || f.rel === `${framework.appDir}/page.js` ? ['', ''] : null);
        if (!m) continue;
        let route = '/' + (m[1] || '').replace(/\/$/, '').split('/').filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@')).join('/');
        if (route === '/') route = '/';
        const dynamic = /\[/.test(route);
        pages.push({ route, file: f.rel, dynamic, title: titleOf(f.content) });
      }
    } else if (framework.pagesDir) {
      for (const f of files) {
        const m = new RegExp(`^${escapeRe(framework.pagesDir)}/(.*)\\.(tsx|jsx|js|ts|mdx)$`).exec(f.rel);
        if (!m) continue;
        const p = m[1];
        if (/^(_app|_document|_error|404|500)$/.test(p) || p.startsWith('api/')) continue;
        let route = '/' + p.replace(/(^|\/)index$/, '');
        route = route.replace(/\/+$/, '') || '/';
        pages.push({ route, file: f.rel, dynamic: /\[/.test(route), title: titleOf(f.content) });
      }
    }
  } else if (framework.name === 'react') {
    pages.push({ route: '/', file: files.find((f) => /(^|\/)(index|main|app)\.(tsx|jsx|js)$/i.test(f.rel))?.rel || null, dynamic: false, title: null });
    for (const f of files) for (const m of f.content.matchAll(/path\s*[:=]\s*["'`](\/[^"'`:*]*)["'`]/g)) if (!pages.some((p) => p.route === m[1])) pages.push({ route: m[1], file: f.rel, dynamic: false, title: null });
  } else if (framework.name === 'html') {
    for (const f of files.filter((x) => x.ext === '.html' || x.ext === '.htm')) pages.push({ route: '/' + f.rel, file: f.rel, dynamic: false, title: titleOf(f.content) });
  } else {
    pages.push({ route: '/', file: null, dynamic: false, title: null });
  }
  pages.sort((a, b) => a.route.length - b.route.length || a.route.localeCompare(b.route));
  return pages.slice(0, 60);
}

function titleOf(content) {
  const m = /<title>\s*([^<]{1,100})<\/title>/i.exec(content) || /<h1[^>]*>\s*([^<]{1,100})</i.exec(content) || /title\s*:\s*["'`]([^"'`]{1,100})["'`]/.exec(content);
  return m ? m[1].trim() : null;
}

export function detectPageTypes(pages, files, pkg) {
  const scores = {};
  const bump = (t, n, why) => { scores[t] = scores[t] || { score: 0, evidence: [] }; scores[t].score += n; if (scores[t].evidence.length < 6) scores[t].evidence.push(why); };
  for (const p of pages) {
    const hay = `${p.route} ${p.file || ''} ${p.title || ''}`.toLowerCase();
    for (const [type, def] of Object.entries(PAGE_TYPES)) for (const kw of def.keywords) if (hay.includes(kw)) bump(type, 3, `route/file "${p.route}" matches "${kw}"`);
    if (p.route === '/') bump('landing', 1, 'root route');
  }
  const text = files.filter((f) => MARKUP_EXT.has(f.ext)).map((f) => f.content.toLowerCase()).join('\n').slice(0, 2_000_000);
  for (const [type, def] of Object.entries(PAGE_TYPES)) {
    let hits = 0;
    for (const kw of def.keywords) { const n = (text.match(new RegExp(`\\b${escapeRe(kw)}\\b`, 'g')) || []).length; hits += Math.min(n, 5); }
    if (hits) bump(type, Math.min(hits, 12) * 0.4, `${hits} content keyword hit(s)`);
  }
  const desc = `${pkg?.description || ''} ${pkg?.name || ''}`.toLowerCase();
  for (const [type, def] of Object.entries(PAGE_TYPES)) for (const kw of def.keywords) if (desc.includes(kw)) bump(type, 2, `package description mentions "${kw}"`);
  const ranked = Object.entries(scores).map(([type, s]) => ({ type, score: +s.score.toFixed(2), evidence: s.evidence })).sort((a, b) => b.score - a.score);
  return { primary: ranked[0]?.type || 'landing', ranked: ranked.slice(0, 6), perPage: pages.map((p) => ({ route: p.route, type: classifyRoute(p) })) };
}
function classifyRoute(p) {
  const hay = `${p.route} ${p.file || ''} ${p.title || ''}`.toLowerCase();
  for (const [type, def] of Object.entries(PAGE_TYPES)) if (def.keywords.some((kw) => hay.includes(kw))) return type;
  return p.route === '/' ? 'landing' : 'unknown';
}

// ----------------------------------------------------------------------------- responsive
export function detectResponsive(files, framework, layout) {
  const html = files.filter((f) => f.ext === '.html' || f.ext === '.htm');
  const viewportMeta = html.length ? html.every((f) => /<meta[^>]+name=["']viewport["']/i.test(f.content)) : framework.name === 'nextjs' ? 'framework-default' : files.some((f) => /name=["']viewport["']/i.test(f.content)) ? true : 'unknown';
  const userScalableNo = files.some((f) => /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?\b/i.test(f.content));
  const fixedWidths = [];
  for (const f of files) for (const m of f.content.matchAll(/(?<![-\w])width\s*:\s*([\d.]+)px/gi)) if (+m[1] >= 600) fixedWidths.push({ file: f.rel, px: +m[1] });
  const mediaQueries = layout.breakpoints.length;
  const hasMobileFirst = files.some((f) => /@media[^{]*min-width/i.test(f.content)) || layout.system === 'tailwind-utilities';
  const colorSchemeMeta = files.some((f) => /color-scheme/i.test(f.content));
  const prefersDark = files.some((f) => /prefers-color-scheme\s*:\s*dark/i.test(f.content) || /\bdark:/.test(f.content));
  const reducedMotion = files.some((f) => /prefers-reduced-motion/i.test(f.content) || /motion-reduce:|motion-safe:/.test(f.content));
  const forcedColors = files.some((f) => /forced-colors/i.test(f.content));
  const safeArea = files.some((f) => /safe-area-inset/i.test(f.content));
  const level = mediaQueries === 0 && layout.system !== 'tailwind-utilities' ? 'none' : hasMobileFirst ? 'mobile-first' : 'desktop-first';
  return { viewportMeta, userScalableNo, mediaQueries, breakpoints: layout.breakpoints, level, fixedWidths: fixedWidths.slice(0, 20), colorSchemeMeta, prefersDark, reducedMotion, forcedColors, safeArea, usesDvh: layout.counts.dvh > 0, uses100vh: layout.counts.vh100 > 0 };
}

// ----------------------------------------------------------------------------- UX problems
export function detectUxProblems(files, framework, typography, layout) {
  const problems = [];
  const add = (id, severity, message, file, extra) => problems.push({ id, severity, message, file, ...(extra || {}) });
  const all = files.map((f) => f.content).join('\n');
  const hasFocusVisible = /:focus-visible|focus-visible:/.test(all);
  for (const f of files) {
    const c = f.content;
    if (/outline\s*:\s*(none|0)\b/i.test(c) && !/:focus-visible/.test(c)) add('focus-removed', 'critical', 'outline:none removes the keyboard focus indicator without a :focus-visible replacement', f.rel);
    if (/\boutline-none\b/.test(c) && !/focus-visible:|focus:ring|focus:outline/.test(c)) add('focus-removed', 'critical', 'Tailwind outline-none without a focus ring replacement', f.rel);
    for (const m of c.matchAll(/font-size\s*:\s*([\d.]+)px/gi)) if (+m[1] < 12) { add('tiny-text', 'high', `font-size ${m[1]}px is below the 12px readability floor`, f.rel); break; }
    if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(c)) add('img-no-alt', 'high', '<img> without alt attribute', f.rel);
    if (/<input\b[^>]*placeholder=[^>]*>/i.test(c) && !/<label\b|aria-label=|aria-labelledby=/i.test(c)) add('placeholder-only-label', 'high', 'inputs use placeholder as the only label', f.rel);
    if (/<button\b[^>]*>\s*<(svg|img|i|span class="[^"]*icon)[^>]*>[\s\S]{0,200}?<\/button>/i.test(c) && !/aria-label=/i.test(c)) add('icon-only-button', 'high', 'icon-only button without aria-label', f.rel);
    if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?\b/i.test(c)) add('zoom-disabled', 'critical', 'viewport disables user zoom (WCAG 1.4.4)', f.rel);
    if (/animation\s*:|@keyframes|transition\s*:/.test(c) && !/prefers-reduced-motion|motion-reduce|motion-safe/.test(all)) add('no-reduced-motion', 'medium', 'animations present but no prefers-reduced-motion handling anywhere in the project', f.rel);
    if (/\binfinite\b/.test(c) && /animation/.test(c)) add('infinite-animation', 'medium', 'infinite animation (distraction, battery); must pause under reduced motion', f.rel);
    if ((f.ext === '.html' || f.ext === '.htm') && !/<html[^>]*\blang=/i.test(c)) add('no-lang', 'medium', '<html> has no lang attribute', f.rel);
    if ((f.ext === '.html' || f.ext === '.htm') && !/<main\b/i.test(c)) add('no-main-landmark', 'low', 'no <main> landmark', f.rel);
    if (/backdrop-filter|backdrop-blur/.test(c) && (c.match(/backdrop-filter|backdrop-blur/g) || []).length >= 3) add('blur-overuse', 'low', 'heavy backdrop-filter use (GPU cost on low-end devices)', f.rel);
    if (/position\s*:\s*fixed|\bfixed\b/.test(c) && !/safe-area-inset|env\(/.test(all) && /bottom\s*:\s*0|bottom-0/.test(c)) add('fixed-bottom-no-safe-area', 'medium', 'bottom-fixed element ignores safe-area insets (notch/home indicator overlap)', f.rel);
    if (/100vh|h-screen/.test(c) && !/dvh|svh/.test(all)) add('vh-mobile-bug', 'medium', '100vh layout without dvh/svh fallback (mobile browser chrome overlap)', f.rel);
    if (/(?<![-\w])(height|min-height)\s*:\s*(1\d|2\d)px/.test(c) && /button|\.btn/.test(c)) add('small-touch-target', 'high', 'control height below 24px minimum', f.rel);
    if (/!important/.test(c) && (c.match(/!important/g) || []).length > 8) add('important-spam', 'low', `${(c.match(/!important/g) || []).length} !important declarations (specificity debt)`, f.rel);
    if (/<div[^>]*onClick/.test(c) && !/role=|tabIndex|tabindex/.test(c)) add('div-as-button', 'high', 'clickable <div> without role/tabIndex (not keyboard accessible)', f.rel);
  }
  if (!hasFocusVisible && files.some((f) => STYLE_EXT.has(f.ext) || MARKUP_EXT.has(f.ext))) add('no-focus-visible-styles', 'medium', 'no :focus-visible styling anywhere in the project', null);
  if (typography.minFontSizePx && typography.minFontSizePx < 12) add('tiny-text-global', 'high', `smallest declared font-size is ${typography.minFontSizePx}px`, null);
  // de-duplicate by id+file
  const seen = new Set();
  return problems.filter((p) => { const k = `${p.id}|${p.file}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 80);
}

// ----------------------------------------------------------------------------- generic "AI-looking" patterns
export function detectGenericPatterns(files, typography, colors) {
  const out = [];
  const add = (id, message, file, count) => out.push({ id, message, file, count });
  const cnt = (rx) => files.reduce((n, f) => n + (f.content.match(rx) || []).length, 0);
  if (typography.interDefault) add('inter-default', 'Inter used as the default typeface (training-data median choice)', null, 1);
  const ipg = cnt(/from-indigo-\d+|to-purple-\d+|from-purple-\d+|to-indigo-\d+|from-violet-\d+|to-fuchsia-\d+|#6366f1|#a855f7|#8b5cf6/gi);
  if (ipg >= 2) add('indigo-purple-gradient', 'indigo/purple gradient palette (generic AI aesthetic)', null, ipg);
  const g3 = cnt(/(md|lg):grid-cols-3\b/g);
  if (g3 >= 2) add('three-card-hero', 'repeated three-column card rows (feature-grid cliché)', null, g3);
  const gt = cnt(/bg-clip-text\s+text-transparent|text-transparent\s+bg-clip-text|background-clip\s*:\s*text/g);
  if (gt) add('gradient-text', 'gradient-filled text', null, gt);
  const emoji = cnt(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  if (emoji >= 3) add('emoji-icons', 'emoji used as icons/decoration', null, emoji);
  const r2 = cnt(/rounded-(2xl|3xl)/g), sl = cnt(/shadow-(lg|xl|2xl)/g);
  if (r2 + sl >= 8) add('rounded-shadow-spam', 'rounded-2xl + shadow-lg card styling repeated everywhere', null, r2 + sl);
  const glass = cnt(/backdrop-blur|backdrop-filter\s*:\s*blur/g);
  if (glass >= 3) add('glass-blur-spam', 'glassmorphism blur used as a default surface treatment', null, glass);
  const lorem = cnt(/lorem ipsum/gi);
  if (lorem) add('lorem-ipsum', 'placeholder copy', null, lorem);
  const cta = cnt(/Get Started/g) + cnt(/Learn More/g);
  if (cta >= 2) add('generic-cta', '"Get Started" / "Learn More" CTA pair', null, cta);
  const nums = cnt(/>\s*0[1-3]\s*</g);
  if (nums >= 3) add('numbered-markers', 'decorative 01/02/03 markers', null, nums);
  const welcome = cnt(/Welcome to /g);
  if (welcome) add('welcome-hero', '"Welcome to …" hero copy', null, welcome);
  const scale = cnt(/hover:scale-105/g);
  if (scale >= 3) add('hover-scale-spam', 'hover:scale-105 applied broadly', null, scale);
  const cyanOnNavy = colors.accents.some((c) => /^#00f/i.test(c.hex) || (c.hex >= '#00e0b0' && c.hex <= '#00ffff')) && colors.darkDefault;
  if (cyanOnNavy) add('neon-on-navy', 'near-black background with a neon cyan/acid accent (generic "AI dashboard" cliché)', null, 1);
  return out;
}

// ----------------------------------------------------------------------------- entry points (files adapters may inject into)
export async function detectEntryPoints(root, framework, files) {
  const styles = [], layouts = [], html = [];
  if (framework.name === 'nextjs') {
    for (const f of files) {
      if (framework.appDir && new RegExp(`^${escapeRe(framework.appDir)}/layout\\.(tsx|jsx|js)$`).test(f.rel)) layouts.push(f.rel);
      if (framework.pagesDir && new RegExp(`^${escapeRe(framework.pagesDir)}/_app\\.(tsx|jsx|js)$`).test(f.rel)) layouts.push(f.rel);
      if (/(^|\/)(globals?|global|index|main|styles?|app)\.css$/.test(f.rel) && !f.rel.includes('node_modules')) styles.push(f.rel);
    }
  } else if (framework.name === 'react') {
    for (const f of files) {
      if (/(^|\/)(main|index)\.(tsx|jsx|js)$/.test(f.rel) && /createRoot|ReactDOM|render\(/.test(f.content)) layouts.push(f.rel);
      if (/(^|\/)(index|main|globals?|app|styles?)\.css$/.test(f.rel)) styles.push(f.rel);
      if (f.ext === '.html') html.push(f.rel);
    }
  } else if (framework.name === 'html') {
    for (const f of files) if (f.ext === '.html' || f.ext === '.htm') html.push(f.rel);
  }
  return { styles: [...new Set(styles)].slice(0, 5), layouts: [...new Set(layouts)].slice(0, 3), html: html.slice(0, 40) };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
