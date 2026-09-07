# KK-UI-GOVERNOR Design OS

A **project-aware frontend Design Operating System**. Point it at any frontend project and it will
inspect the code, recommend (or let you pick) one coherent design direction, adapt that direction to
the project's own stack, and apply it through a transaction-protected flow that verifies the result
on 240px–3840px devices, light/dark/high-contrast, keyboard, contrast, reduced-motion, forced-colors
and performance gates. A failed candidate rolls back automatically and every run ends in `REPORT.html`.

```
Inspect → Select → Adapt → Probe → Preview → Write → Verify → Keep / Rollback
```

## Quick start (cloud / Linux / macOS)

```bash
cd kk-ui-governor
bootstrap/setup-kk-ui-design-vault.sh          # builds DESIGN-VAULT from pinned, license-verified sources
node bin/kkgov.js scan ../my-project            # Design Intelligence report
node bin/kkgov.js recommend ../my-project       # coherent direction + rationale (no changes)
node bin/kkgov.js apply ../my-project --auto    # full transaction; REPORT.html in .kk-governor/tx/<id>/
node bin/kkgov.js apply ../my-project --preset enterprise-admin --verify full --decide ask
node bin/kkgov.js keep ../my-project <txId>     # or: rollback
```

Windows: `powershell -ExecutionPolicy Bypass -File bootstrap\SETUP-KK-UI-DESIGN-VAULT.ps1` then the same `node bin\kkgov.js …` commands.

Requirements: Node ≥ 18. The verification suite uses Playwright + Chromium (`npm install` in this
folder or a global Playwright install; `--verify static` works without a browser but never counts
as completion).

## What it does

| Layer | Module | Purpose |
|---|---|---|
| Design Vault | `vault-manifest.json`, `src/vault/*`, `bootstrap/*` | 17 upstream sources, 65 assets, pinned commit SHAs, license text verification, normalized `DESIGN-VAULT/` with `catalog.json`, `NOTICES.md`, lock file |
| Design Intelligence | `src/intelligence/scanner.js` | framework, CSS/UI stack, components, brand, colours, typography, layout system, page types, responsive behaviour, UX problems, generic "AI-looking" patterns |
| Recommendation | `src/intelligence/recommend.js`, `selector.js`, `data/presets.js` | scores 10 styles × 11 page types × 5 platforms, enforces coherence (no random mixing), preserves brand |
| Tokens | `src/pipeline/tokens.js` | light / dark / high-contrast palettes derived from the brand colour, every text pair auto-corrected to WCAG AA |
| Adapters | `src/adapters/{html,tailwind,react,nextjs,unsupported}.js` | convert design intent into the target stack; additive-only edits inside marker blocks; unsupported frameworks handled gracefully |
| Governor core | `src/core/{journal,safety-gates,audit,governor,report}.js` | write-ahead journal, byte-verified backups, atomic writes, 9 safety gates, crash recovery, keep/rollback, HTML/JSON/MD reports |
| Verification | `src/verify/*` | Playwright device matrix + 21 checks, baseline comparison ("never worse"), Node relay for external resources in sandboxed clouds, static fallback |

See `docs/` for architecture, usage, safety model, vault provenance and verification details.

## Safety model (short version)

* Nothing is written before Probe + 9 safety gates pass; every write is journaled and backed up first.
* Existing files only ever receive a governor marker block (proved by gate G2); business logic is never removed.
* No dependency is ever added (gate G1); vault components needing missing packages are converted to dependency-free equivalents.
* Brand identity is preserved unless `--brand-mode replace` / `--platform brand-custom` is selected (gate G3).
* Only allow-listed licenses enter the vault; notices are preserved (gate G4, `ATTRIBUTION.md` in every candidate).
* Verification failure ⇒ automatic rollback with hash verification. Partial success is reported as `FAIL`.

## Samples

* `samples/html-landing` — plain HTML/CSS/JS marketing site with planted UX problems.
* `samples/react-dashboard` — Vite + React + Tailwind v4 dashboard.
* The host repository (`..`) is a Next.js 14 app router project used as the realistic framework target.

## Tests

```bash
npm test          # unit tests (journal/rollback/crash recovery, gates, licenses, scanner, recommend, tokens, adapters, catalog)
npm run test:e2e  # end-to-end: full flow on the HTML sample + forced-failure rollback proof (needs Chromium)
```
