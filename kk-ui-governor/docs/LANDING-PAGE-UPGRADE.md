# Upgrading only the landing page of an app that also has an authenticated area

This is the runbook for the common case: a project with a public landing page **and** a signed-in
dashboard, where only the landing page may change.

## The guarantee

A scoped run (`--landing-only`) makes three separate promises, each enforced by a different mechanism:

| Promise | Enforced by |
|---|---|
| No CSS rule can apply outside the landing page | `scopeCss()` prefixes every rule with the scope root; **gate G10** fails the run if any renderable selector escapes |
| Files outside the landing page are not written | The transaction plan contains one page; **gate G2** proves existing files change only inside a marker block |
| Other routes look *identical* afterwards | **UNCHANGED-ROUTES**: a computed-style signature of every other route is captured before and after the write and compared element by element |

The third promise has a catch worth understanding. A route behind auth redirects an unauthenticated
browser to your login page, and comparing that login page with itself would "prove" nothing while
looking green. The check therefore records *where it actually landed*: a route that redirected is
reported as **not proven** and fails the check closed, rather than counted as evidence. To genuinely
verify signed-in routes, capture a Playwright `storageState` once and pass it:

```bash
node bin/kkgov.js apply "C:\path\to\app" --landing-only --auth-storage-state auth.json
```

If any of those fail, the transaction rolls back automatically and the verdict is `FAIL`.

## Run it (Windows, one command)

```powershell
# dry run: scan, recommend, apply, verify on every device, roll back. Nothing is kept.
powershell -ExecutionPolicy Bypass -File bootstrap\Upgrade-LandingPage.ps1 -ProjectPath "C:\path\to\your-project"

# then, when the report looks right: apply for real and leave it PENDING your decision
powershell -ExecutionPolicy Bypass -File bootstrap\Upgrade-LandingPage.ps1 -ProjectPath "C:\path\to\your-project" -Style premium -Verify full -Apply
```

## Run it (step by step, any platform)

```bash
# 0. one time: build the design vault
bootstrap/setup-kk-ui-design-vault.sh                 # Windows: powershell -ExecutionPolicy Bypass -File bootstrap\SETUP-KK-UI-DESIGN-VAULT.ps1

# 1. look before you touch anything
node bin/kkgov.js scan "C:\path\to\your-project"
node bin/kkgov.js recommend "C:\path\to\your-project" --landing-only --style premium

# 2. dry run: apply, verify on every device, then roll back regardless of outcome
node bin/kkgov.js apply "C:\path\to\your-project" --landing-only --style premium --verify standard --decide rollback

# 3. for real: keep only if every gate passes
node bin/kkgov.js apply "C:\path\to\your-project" --landing-only --style premium --verify standard --decide ask
node bin/kkgov.js keep "C:\path\to\your-project" <txId>     # or: rollback
```

`--decide ask` leaves the change in place with the transaction `pending` so you can look at the site
yourself before committing to it. `rollback` works at any time, including after `keep`.

Useful flags: `--style premium|modern|luxury|creative|visual-rich|minimal`, `--theme light|dark|auto`,
`--density comfortable|spacious`, `--motion subtle|standard|complex`, `--verify quick|standard|full`,
`--max-guard-pages N` (how many other routes to prove unchanged, default 4),
`--auth-storage-state <file>` (sign in so protected routes are really checked).

## What each stack gets

**Static HTML** — fully automatic. Only the landing page file is modified, and only by one marker
block in `<head>` that sets the scope attribute (from an inline script, so styling is correct on the
first paint with no flash) and links the stylesheet.

**React / Next.js** — the theme is **not** imported globally. The adapter writes a `KkScope`
component that imports the stylesheet itself, so until you use it *nothing changes anywhere*:

```tsx
import { KkScope } from './kk-design/KkScope';

export default function LandingPage() {
  return (
    <KkScope>
      {/* your existing landing page markup, unchanged */}
    </KkScope>
  );
}
```

That one edit is deliberately left to a human: wrapping the right component is a judgement call, and
placing it anywhere other than the landing page would break the guarantee the tool just proved.
Re-run `apply` afterwards to verify the result on the full device matrix.

## What this does and does not do

It **restyles your existing markup**: typography scale and pairing, colour system derived from your
own brand colour with every pair corrected to WCAG AA, spacing, radius, shadow, focus states, touch
targets, responsive behaviour from 240px to 3840px, dark mode, high contrast, forced colors,
reduced motion, and the accessibility problems its scan found.

It does **not author new landing-page sections or copy**. If your landing page is one hero and three
cards, you get a well-designed hero and three cards — not a new information architecture. Adding
sections, imagery or a new narrative is markup work that needs a human decision about the product
story; the Governor's job is to make whatever markup exists look and behave correctly, provably,
without touching anything else.

## Deployment

The Governor has **no deploy command**. It verifies a project on your machine and stops there.
Deploy with whatever already publishes the site (`vercel --prod`, `netlify deploy --prod`, a git push
that triggers CI, …). Afterwards you can point the verification suite at the live origin:

```bash
node bin/kkgov.js verify "C:\path\to\your-project" --url https://your-site.example --verify standard
```

That runs the same device matrix and accessibility checks against production and exits non-zero if
anything fails. The browser fetches the live origin directly, so the deployment's real delivery path
(redirects, caching headers, CDN) is part of what gets tested, and a failure from the site's own
origin is reported as a real error rather than third-party noise.

If the machine running the check has no outbound network from the browser itself (a locked-down CI
sandbox behind a proxy), set `KKGOV_RELAY_ORIGIN=1` to fetch the origin through Node instead. The
result is then marked `originRelayed` because the real delivery path was not exercised — use it to
check markup and accessibility, not to certify a deployment.
