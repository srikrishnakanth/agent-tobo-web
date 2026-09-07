# Verification suite

Engine: Playwright + Chromium, resolved from the project's `node_modules` first, then platform-appropriate
global locations (including `%APPDATA%\npm\node_modules` on Windows). A launch failure reports the real
Chromium error and where it looked, and never degrades silently to a green run.

Engine notes: Playwright + Chromium (global or local install). Modes: `quick` (~17 contexts/page), `standard` (~41), `full` (~51), `static` (no browser; never counts as completion).

## Device matrix (`src/verify/devices.js`)
* Widths 240 → 3840 px sweep (27 widths in `full`), phones 360/390/412 portrait + 844×390 landscape, feature phone 240, foldables 280×653 (closed) / 717×512 (open) / 1114×705 (dual), tablets 768/1024, laptop 1280, 1440@2×, desktop 1920, ultrawide 3440, 4K 3840 (@1× and @2×).
* Conditions: dark scheme (phone + desktop), forced-colors, prefers-reduced-motion (phone + desktop), 200 % font scaling (phone + desktop), simulated low-end device (2 cores, 2 GB, save-data).

## Checks (`src/verify/runner.js`)
| ID | Gate | Fail condition |
|---|---|---|
| LOAD | pages load | navigation/measurement error |
| RESP-SWEEP / OVERFLOW | responsive 240–3840 | horizontal overflow (culprits listed) |
| MOBILE-ORIENT | portrait / landscape | overflow on phone devices |
| FOLDABLE | foldable widths | overflow at 280 / 717 / dual |
| DPR | pixel ratio | DPR mismatch |
| THEME | light / dark | dark scheme requested but light surfaces (advisory) |
| FONT-200 | 200 % font scaling | overflow or clipped text containers |
| KEYBOARD-NAV | keyboard navigation | Tab never reaches controls / focus lands on invisible elements |
| FOCUS-VISIBLE* | focus visibility | any focused control without outline/box-shadow/border/background change |
| CONTRAST | WCAG AA | text < 4.5:1 (3:1 for large) on known backgrounds |
| FORCED-COLORS* | Windows High Contrast | invisible text (colour == background) |
| REDUCED-MOTION* | prefers-reduced-motion | running animations > 100 ms or infinite; runtime not "off"; visible WebGL |
| LAYOUT-SHIFT | CLS | CLS > 0.1 (warn > 0.05, unsized images) |
| STICKY-FIXED | fixed / sticky elements | off-screen, wider than viewport, > 40 % coverage on small screens |
| TOUCH-TARGET | target size | < 24 px (WCAG 2.5.8) fail; 24–44 px warn; inline text links exempt |
| PERF | performance | DCL > 15 s or < 20 fps fail; > 4 s / < 45 fps / long tasks / DOM / transfer warn |
| ANIM-3D-FALLBACK* | degrade on low-end / reduced motion | runtime keeps full motion or WebGL on low-end; WebGL under reduced motion |
| CONSOLE-ERRORS | runtime errors | any console error / pageerror / failed local request not in baseline |
| EXTERNAL-RESOURCES | fonts / CDN | advisory: external resource failed |
| A11Y-BASICS | landmarks, lang, alt, labels | advisory |
| UNCHANGED-ROUTES* | scoped runs: other routes must not change | any computed-style difference on a guard route, or a signature that could not be captured |
| SCOPE-ACTIVE | scoped runs: the design is actually applied | no scope root present where the adapter applies it automatically (advisory where a manual wrap is required) |
| BUILD | the project's own production build | `npm run build` fails after the design is written (framework projects only) |

### Production build (BUILD)

A design can compile in a dev server and still break `next build` / `vite build` — the browser matrix cannot
see that. After Write, the Governor runs the project's own build script (`src/verify/build-check.js`) and
compares it against a **baseline build of the untouched project**, so a build that was already broken is
reported as a warning and never charged to the candidate. Skipped for static and unsupported projects, and
for projects with no `build` script. Disable with `--no-build`.

`*` = governor guarantee: fails regardless of the baseline. Every other check compares against the
baseline run of the unmodified project: a candidate may never be worse; pre-existing findings are reported as warnings.

## Sandboxed clouds
Chromium often cannot reach the internet from a sandbox while Node can (via a proxy). The runner installs a
relay (`installRelay`) that serves external GET requests from Node's `fetch`, so Google Fonts and CDNs load
realistically during verification. Disable with `KKGOV_EXTERNAL_RELAY=off`.
