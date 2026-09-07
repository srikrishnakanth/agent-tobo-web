# Architecture

```
kk-ui-governor/
├── bin/kkgov.js                 CLI
├── bootstrap/                   SETUP-KK-UI-DESIGN-VAULT.ps1 (Windows), setup-kk-ui-design-vault.sh (Linux/macOS/cloud), setup-vault.mjs (shared core)
├── vault-manifest.json          source of truth for the Design Vault (pinned commits, licenses, asset metadata)
├── DESIGN-VAULT/                generated: assets/, sources/, catalog.json, NOTICES.md, VAULT-MANIFEST.lock.json, SETUP-REPORT.json
├── src/
│   ├── core/        logger, fsutil, licenses (SPDX policy), journal (transactions), safety-gates, audit, report, governor
│   ├── vault/       manifest-schema, harvest (raw-at-commit fetch + license verification), normalize, catalog (search)
│   ├── intelligence/ color (WCAG math), scanner (+detectors), recommend, selector, data/presets
│   ├── pipeline/    tokens, emit-css, emit-js, emit-react, markers, probe, preview
│   ├── adapters/    base, tailwind (mixin), html, react, nextjs, unsupported, registry
│   ├── server/      static-server, process-server (next/vite/cra)
│   └── verify/      devices (matrix), browser-probe (in-page measurements), runner (checks, baseline, relay, static fallback)
├── samples/         html-landing, react-dashboard
└── tests/           unit/, e2e/
```

## Transaction flow

1. **Inspect** – `scanProject` produces the project picture (`inspect.json`).
2. **Select** – `resolveSelection` merges CLI flags / `kkgov.config.json` / named preset with the recommender; `buildTokens` derives contrast-validated tokens (`selection.json`, `tokens.json`).
3. **Adapt** – the framework adapter converts tokens + selection into a candidate file set staged under `.kk-governor/tx/<id>/candidate/`. Existing files are only touched by inserting one marker block.
4. **Probe** – syntax/compile sanity (CSS structure, `node --check`, TypeScript parse for TSX) and the 9 safety gates (G1 no new dependency, G2 additive-only, G3 brand preserved, G4 licenses, G5 path safety, G6 backup guarantee, G7 size, G8 probe, G9 heavy-motion fallback).
5. **Preview** – current screenshots (pre-write), candidate overlay (static projects) or component gallery, baseline verification of the current project.
6. **Write** – write-ahead journal entry → byte-verified backup → atomic write → post-write audit.
7. **Verify** – device matrix through Chromium; each check compares to the baseline (never worse) while governor guarantees (focus visibility, reduced motion, forced colors, 3D/animation fallback) are absolute.
8. **Keep / Rollback** – pass ⇒ keep (or `pending` with `--decide ask`); fail ⇒ automatic rollback with hash verification. Crashes are recovered on the next run (`kkgov recover`).
9. **Report** – `REPORT.html` (self-contained, screenshots embedded), `REPORT.json`, `REPORT.md`; copies in `.kk-governor/reports/`.

## Adapters

| Adapter | Target | Output | Injection |
|---|---|---|---|
| `html` | plain HTML/CSS/JS | `kk-design/{tokens,theme}.css`, `motion.js`, `ATTRIBUTION.md`, `tokens.json` | `<link>`/`<script>` block before `</head>` of every HTML entry |
| `react` | Vite / CRA / other bundlers | `src/kk-design/*` + dependency-free components + `KkThemeProvider` | CSS import in the entry file (or Tailwind globals) |
| `nextjs` | app / pages router | same as React, placed next to the root layout, client directives added | import from root layout (or Tailwind globals) |
| `tailwind` (mixin) | v3 / v4 | v4: `@theme inline` bridge; v3: `@layer components` wrapping | `@import` after `@import "tailwindcss"` (v4) or at the top (v3) |
| `unsupported` | Vue, Nuxt, Svelte, Angular, Astro, … | tokens-only candidate staged, nothing injected | none; run aborts before Write unless `--allow-unsupported` |

## Design-intent conversion (no blind copying)

Vault components (shadcn/Radix, Swiper, Chart.js, three.js examples, Material/Fluent/Ionic tokens) are
used as *intent*: the catalog records their dependencies, and the emitters produce equivalents that need
no new package (native `<dialog>` modal, scroll-snap carousel, SVG charts, CSS depth with static
fallback for 3D). Their licenses and commits are listed in every candidate's `ATTRIBUTION.md`.
