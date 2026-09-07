# Verified results (cloud run)

Environment: Linux (`Linux 6.18.44-fc-v24`), Node 22.22.2, Playwright 1.56.1 + bundled Chromium, no display.
All figures below come from the archived `REPORT.json` files in `../reports/`.

## Unit tests

`npm test` — **32 passing, 0 failing**. Coverage: transaction journal (backup, atomic write, byte-exact
rollback, crash recovery, plan/reality mismatch, path traversal), all 9 safety gates, SPDX policy and
license-text detection, colour math, scanner detections, recommendation coherence, token contrast across
every style × platform × preset, vault manifest/catalog/integrity, adapters (HTML additive injection,
Next.js client directives, unsupported handling), device-matrix coverage, and the production build check
(skip rules, success, failure, timeout, log extraction).

`npm run test:e2e` — **4 passing, 0 failing**: the full flow on the HTML sample, the forced-failure
rollback proof, the `decide=ask` pending/keep path, and strict no-baseline mode.

`kkgov vault verify` — 65 assets, 0 integrity problems.

## End-to-end proof runs

Each run executes the full flow: **Inspect → Select → Adapt → Probe → Preview → Write → Verify → Keep/Rollback → REPORT.html**.

| Project | Adapter | Mode | Contexts | Verdict | Baseline problems fixed |
|---|---|---|---|---|---|
| `samples/html-landing` (plain HTML/CSS/JS) | html | standard | 82 loads / 41 devices | PASS (kept) | RESP-SWEEP 20, MOBILE-ORIENT 8, FOLDABLE 3, FONT-200 2, FOCUS-VISIBLE 14, REDUCED-MOTION 2, OVERFLOW 17, TOUCH-TARGET 103, CONTRAST 273→ (see report) |
| `samples/react-dashboard` (Vite + React + Tailwind v4) | react | quick | 17 loads | PASS (kept) | RESP-SWEEP 3, MOBILE-ORIENT 1, FOLDABLE 1, FONT-200 1, FOCUS-VISIBLE 6, FORCED-COLORS 1, OVERFLOW 4, TOUCH-TARGET 4 |
| host repo (Next.js 14 app router + Tailwind v4) | nextjs | standard | 41 loads / 41 devices | PASS (kept) | RESP-SWEEP 2, MOBILE-ORIENT 1, FOLDABLE 1, FOCUS-VISIBLE 14, FORCED-COLORS 1, OVERFLOW 2 |
| host repo, second run over its own output | nextjs | quick | 17 loads | PASS (kept) | baseline already clean; 16 governor-owned files replaced, no user file touched |
| host repo, with the BUILD gate active | nextjs | quick | 17 loads + 2 builds | PASS (kept) | baseline build 13s pass, candidate build 13s pass |

Every run ends with all 22 verification checks at `pass` or `warn`; no check may regress against the
project's own baseline, and the four governor guarantees (FOCUS-VISIBLE, REDUCED-MOTION, FORCED-COLORS,
ANIM-3D-FALLBACK) must pass absolutely. Remaining `warn` entries are pre-existing issues in the sample
content that the Governor is not allowed to fix without changing markup (image intrinsic sizes, a missing
`<main>` landmark, unlabelled demo inputs) — they are reported, never silently accepted as passes.

## Production build gate

Dev-server verification passed on the host app while `npm run build` was still failing, which exposed a real
gap: nothing checked the project's own production build. `src/verify/build-check.js` now runs it after Write
and compares against a baseline build of the untouched project, so pre-existing breakage is a warning and a
candidate that breaks the build fails and rolls back. Covered by 5 unit tests (skip rules, success, failure,
timeout, log extraction).

While proving this, three build defects were found in the host repository that exist on `main` and were never
touched by the Governor:

| Defect | File | Disposition |
|---|---|---|
| Stray `}` after the exported handler (syntax error) | `src/app/api/autonomous/route.ts` | fixed — unambiguous, no semantic choice |
| `useState`/`useRef` without type parameters inferring `never` | `src/app/page.tsx` | fixed — annotations read directly off existing usage |
| `runAutonomous` imported from `autonomous-engine`, but `autonomous-engine.tsx` (resolved first) only exports `runAutonomousCycle` | `core/engine/` | **left alone and reported** — deciding which engine is canonical is a product call, not a design one |

The Governor's own files also broke the host typecheck once: Next walked into `DESIGN-VAULT/assets/**`
vendored TSX. `kk-ui-governor` is now excluded from the host `tsconfig.json` and ESLint config, which is the
correct boundary for a standalone Node package living inside the app repo.

## Rollback proof

`tests/e2e/flow.test.js` injects a deliberately broken candidate (5000px body width + a thrown runtime
error) into the HTML adapter. The Governor writes it, verification fails on RESP-SWEEP/CONSOLE-ERRORS, and
the transaction rolls back automatically. The test asserts every original file hash is restored byte-exact
and no governor file remains. Manual rollback of a *kept* transaction is asserted in the same file, and was
exercised for real on the React sample and the host app during this session (`git diff` empty afterwards).

## Known measurement corrections made during the runs

Two failures during bring-up were harness artefacts and were fixed in the harness, not papered over:

1. **External resources.** Chromium cannot reach the internet from this sandbox while Node can. Without a
   relay, every page logged `ERR_CONNECTION_RESET` for Google Fonts. The runner now serves external GET
   requests from Node `fetch` (`installRelay`), so fonts load exactly as they would in production.
2. **200% font scaling.** The scale style was injected at `DOMContentLoaded`, i.e. after first paint, so a
   rem-based candidate scored a layout shift a real user (whose browser font setting applies from the first
   paint) never sees. The style is now attached the instant `<html>`/`<head>` exists.

Genuine candidate defects found by the suite and fixed in the *generator* included: a bottom-fixed cookie
bar covering 42 % of a 240px viewport, `on-primary` label contrast below AA on mid-luminance brand colours,
dark tokens applied over hard-coded light surfaces in projects without dark-mode support, and Tailwind v4
bundling order dropping the font `@import`.
