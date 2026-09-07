// Scope a generated stylesheet to one region of an application.
//
// Why this exists: the governor's theme deliberately styles bare elements (body, h1..h6, button,
// input, table, a, dialog ...) so a page looks designed without touching its markup. That is correct
// for a whole-project run and WRONG when the user asks to upgrade only the landing page of an app
// that also has an authenticated dashboard — the same rules would restyle the dashboard too.
//
// scopeCss() rewrites every style rule so it only applies inside a scope root, e.g.
//   body { ... }            ->  [data-kk-scope="landing"] { ... }
//   h1, .kk-h1 { ... }      ->  [data-kk-scope="landing"] h1, [data-kk-scope="landing"] .kk-h1 { ... }
//   @media (...) { a { } }  ->  @media (...) { [data-kk-scope="landing"] a { } }
// while leaving @keyframes/@font-face/@import/@charset/@property and custom-property declarations on
// :root alone (those are inert until something references them, and keyframes names are global).
//
// The parser is brace-matching with string/comment awareness — enough for the CSS this project emits
// (which it also round-trips in tests), and deliberately conservative: anything it does not recognise
// is passed through unchanged rather than mangled.

/** At-rules whose body contains nested style rules and must be recursed into. */
const NESTING_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'scope', 'document']);
/** At-rules whose body must never be touched. */
const OPAQUE_AT_RULES = new Set(['keyframes', '-webkit-keyframes', 'font-face', 'font-feature-values', 'counter-style', 'property', 'page', 'viewport', 'theme']);

/**
 * @param {string} css stylesheet source
 * @param {string} scope a selector for the scope root, e.g. '[data-kk-scope="landing"]'
 * @param {object} [opts]
 * @param {boolean} [opts.keepRootVars=true] keep custom-property declarations on :root global
 *   (tokens are inert and other stylesheets may reference them) while still scoping :root's
 *   non-custom declarations.
 * @param {'html'|'container'} [opts.rootKind='container'] where the scope root sits in the document.
 *   'html'      - the attribute is set on <html> (static pages): body stays a descendant, so
 *                 `body { }` becomes `SCOPE body { }`.
 *   'container' - the attribute is on a wrapper element inside body (React/Next): there is no
 *                 descendant body, so `body { }` collapses onto the wrapper itself.
 * @returns {string}
 */
export function scopeCss(css, scope, opts = {}) {
  const { keepRootVars = true, rootKind = 'container' } = opts;
  if (!scope) return css;
  return transform(String(css), scope, keepRootVars, rootKind);
}

function transform(css, scope, keepRootVars, rootKind) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const ws = readWhitespaceAndComments(css, i);
    if (ws.end > i) { out += css.slice(i, ws.end); i = ws.end; continue; }

    if (css[i] === '@') {
      const at = readAtRule(css, i);
      if (!at) { out += css.slice(i); break; }
      const name = at.name.toLowerCase();
      if (at.body === null) {
        // statement at-rule: @import ...; @charset ...;
        out += css.slice(at.start, at.end);
      } else if (NESTING_AT_RULES.has(name)) {
        out += css.slice(at.start, at.bodyStart + 1);
        out += transform(css.slice(at.bodyStart + 1, at.bodyEnd), scope, keepRootVars, rootKind);
        out += css.slice(at.bodyEnd, at.end);
      } else if (OPAQUE_AT_RULES.has(name)) {
        out += css.slice(at.start, at.end);
      } else {
        // Unknown at-rule with a body: pass through untouched rather than risk mangling it.
        out += css.slice(at.start, at.end);
      }
      i = at.end;
      continue;
    }

    const rule = readStyleRule(css, i);
    if (!rule) { out += css.slice(i); break; }
    const scoped = scopeSelectorList(rule.selector, scope, keepRootVars, rule.body, rootKind);
    if (scoped.extraGlobal) out += scoped.extraGlobal;
    out += scoped.selector + ' {' + rule.body + '}';
    i = rule.end;
  }
  return out;
}

/** Rewrite a comma-separated selector list so each part is confined to `scope`. */
export function scopeSelectorList(selectorList, scope, keepRootVars = true, body = '', rootKind = 'container') {
  const parts = splitTopLevel(selectorList, ',').map((s) => s.trim()).filter(Boolean);
  let extraGlobal = '';
  const mapped = [];
  for (const sel of parts) {
    // :root / html carry design tokens. Custom properties stay global so anything already referencing
    // them keeps working; everything else on those selectors is confined to the scope root.
    if (/^(:root|html)$/i.test(sel)) {
      if (keepRootVars) {
        const custom = onlyCustomProperties(body);
        if (custom.trim()) extraGlobal += `${sel} {${custom}}\n`;
      }
      mapped.push(scope);
      continue;
    }
    if (/^body$/i.test(sel)) { mapped.push(rootKind === 'html' ? `${scope} body` : scope); continue; }
    // Already scoped (idempotent re-run).
    if (sel.startsWith(scope)) { mapped.push(sel); continue; }
    // A selector that targets the root element itself with state/attribute qualifiers
    // (:root[data-theme="dark"], html[data-motion="reduced"]) keeps its qualifier and gains the scope
    // as a descendant relationship.
    const rootQualified = /^(?::root|html)((?:\[[^\]]*\]|[:.#][\w-]+(?:\([^)]*\))?)+)\s*(.*)$/i.exec(sel);
    if (rootQualified) {
      const qualifier = rootQualified[1];
      const rest = rootQualified[2].trim();
      if (rootKind === 'html') {
        // The scope attribute is ON <html>, so the qualifier applies to the scope root itself:
        //   :root[data-theme="dark"] .x  ->  [data-kk-scope="landing"][data-theme="dark"] .x
        mapped.push(`${scope}${qualifier}${rest ? ' ' + rest : ''}`);
      } else {
        // The scope root is a wrapper inside body, so the root qualifier stays an ancestor condition:
        //   :root[data-theme="dark"] .x  ->  html[data-theme="dark"] [data-kk-scope="landing"] .x
        mapped.push(`html${qualifier} ${scope}${rest ? ' ' + rest : ''}`);
      }
      continue;
    }
    mapped.push(`${scope} ${sel}`);
  }
  return { selector: mapped.join(',\n'), extraGlobal };
}

/** Keep only `--custom: value;` declarations from a declaration block. */
function onlyCustomProperties(body) {
  const kept = [];
  for (const decl of splitTopLevel(body, ';')) {
    const d = decl.trim();
    if (!d) continue;
    if (/^--[\w-]+\s*:/.test(d)) kept.push('  ' + d + ';');
  }
  return kept.length ? '\n' + kept.join('\n') + '\n' : '';
}

/** Split on a delimiter that is not inside (), [], {} or a string. */
export function splitTopLevel(input, delimiter) {
  const out = [];
  let depthParen = 0, depthBracket = 0, depthBrace = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && input[i + 1] === '*') { const e = input.indexOf('*/', i + 2); i = e === -1 ? input.length : e + 1; continue; }
    if (c === '(') depthParen++;
    else if (c === ')') depthParen = Math.max(0, depthParen - 1);
    else if (c === '[') depthBracket++;
    else if (c === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (c === '{') depthBrace++;
    else if (c === '}') depthBrace = Math.max(0, depthBrace - 1);
    else if (c === delimiter && !depthParen && !depthBracket && !depthBrace) { out.push(input.slice(start, i)); start = i + 1; }
  }
  out.push(input.slice(start));
  return out;
}

function readWhitespaceAndComments(css, i) {
  let j = i;
  for (;;) {
    while (j < css.length && /\s/.test(css[j])) j++;
    if (css[j] === '/' && css[j + 1] === '*') {
      const e = css.indexOf('*/', j + 2);
      j = e === -1 ? css.length : e + 2;
      continue;
    }
    break;
  }
  return { end: j };
}

/** Read `@name prelude ;` or `@name prelude { body }`. */
function readAtRule(css, start) {
  let i = start + 1;
  while (i < css.length && /[\w-]/.test(css[i])) i++;
  const name = css.slice(start + 1, i);
  // scan prelude to ';' or '{'
  let quote = null, depthParen = 0;
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; i++; continue; }
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? css.length : e + 2; continue; }
    if (c === '(') depthParen++;
    else if (c === ')') depthParen = Math.max(0, depthParen - 1);
    else if (c === ';' && !depthParen) return { name, start, end: i + 1, body: null, bodyStart: -1, bodyEnd: -1 };
    else if (c === '{' && !depthParen) {
      const close = matchBrace(css, i);
      if (close === -1) return null;
      return { name, start, end: close + 1, body: css.slice(i + 1, close), bodyStart: i, bodyEnd: close };
    }
    i++;
  }
  return { name, start, end: css.length, body: null, bodyStart: -1, bodyEnd: -1 };
}

/** Read `selector { body }` starting at a non-at-rule position. */
function readStyleRule(css, start) {
  let i = start;
  let quote = null, depthParen = 0, depthBracket = 0;
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; i++; continue; }
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? css.length : e + 2; continue; }
    if (c === '(') depthParen++;
    else if (c === ')') depthParen = Math.max(0, depthParen - 1);
    else if (c === '[') depthBracket++;
    else if (c === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (c === '{' && !depthParen && !depthBracket) {
      const close = matchBrace(css, i);
      if (close === -1) return null;
      return { selector: css.slice(start, i).trim(), body: css.slice(i + 1, close), end: close + 1 };
    } else if (c === '}' && !depthParen && !depthBracket) {
      return null; // stray close brace: bail out and pass the remainder through
    }
    i++;
  }
  return null;
}

/** Index of the '}' matching the '{' at `open`, respecting strings and comments. */
function matchBrace(css, open) {
  let depth = 0, quote = null;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? css.length : e + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Count style rules whose selector would apply outside the scope root — used by the safety gate to
 * prove a scoped stylesheet cannot restyle the rest of the application.
 * @returns {{ total: number, unscoped: string[] }}
 */
export function auditScope(css, scope) {
  const unscoped = [];
  let total = 0;
  const walk = (src) => {
    let i = 0;
    while (i < src.length) {
      const ws = readWhitespaceAndComments(src, i);
      if (ws.end > i) { i = ws.end; continue; }
      if (src[i] === '@') {
        const at = readAtRule(src, i);
        if (!at) break;
        const name = at.name.toLowerCase();
        if (at.body !== null && NESTING_AT_RULES.has(name)) walk(src.slice(at.bodyStart + 1, at.bodyEnd));
        i = at.end;
        continue;
      }
      const rule = readStyleRule(src, i);
      if (!rule) break;
      total++;
      for (const sel of splitTopLevel(rule.selector, ',').map((s) => s.trim()).filter(Boolean)) {
        // A rule is confined if the scope appears in the compound chain, or it is a root-qualified
        // selector that still contains the scope (html[data-theme] [data-kk-scope] ...).
        if (!sel.includes(scope)) unscoped.push(sel);
      }
      i = rule.end;
    }
  };
  walk(String(css));
  return { total, unscoped };
}
