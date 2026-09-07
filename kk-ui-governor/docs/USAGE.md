# Usage

## Selecting a design
Everything is selectable; anything left unset is auto-recommended from the scan.

```
--preset <name>            auto | saas-modern-dashboard | enterprise-admin | data-ops-console | premium-landing | luxury-storefront |
                           creative-launch | visual-showcase | 3d-hero-landing | ios-app | android-app | windows-app | minimal-docs |
                           ai-assistant | accessible-high-contrast
--style      premium | modern | minimal | enterprise | luxury | creative | visual-rich | native-app | 3d | data-dense
--page       landing | dashboard | crm | admin | ecommerce | inbox | settings | auth | onboarding | docs | ai-ui
--platform   ios | android-material | windows-fluent | neutral-web | brand-custom
--theme      light | dark | high-contrast | auto
--density    compact | comfortable | spacious
--motion     none | subtle | standard | complex
--devices    mobile,foldable,tablet,laptop,desktop,ultrawide,4k
--a11y       reduced-motion,keyboard,screen-reader,forced-colors,large-text
--components buttons,inputs,cards,tables,navigation,sidebar,modals,charts,carousel
--effects    animations,micro-interactions,scroll-effects,carousel,parallax,3d
--brand-mode preserve | replace
--landing-only             upgrade ONLY the landing page; every other route is provably untouched
--scope <name>             same, with a custom scope name (default scope is "global" = whole project)
--max-guard-pages <n>      how many other routes to prove unchanged (default 4; the rest are reported, never hidden)
--radius <px>
```

`kkgov.config.json` in the project root can hold the same keys under `"selection"`.

## Transaction control
```
--verify quick|standard|full|static     depth of verification (static never yields PASS)
--decide auto|ask|rollback              auto keeps on pass; ask leaves the transaction pending; rollback = dry run
--no-preview --no-baseline --no-build --allow-unsupported --max-pages N
                                        --no-baseline makes verification strict: with nothing to compare against,
                                        the project's own pre-existing findings are charged to the candidate.
                                        --no-build skips the project's production build check (framework projects).
kkgov verify <project> --url <origin> [--routes /,/pricing]
                                        run the same device/accessibility matrix against a LIVE deployment
kkgov status <project>                  list transactions
kkgov keep|rollback <project> <txId>    decide / undo (rollback also undoes kept transactions)
kkgov recover <project>                 roll back anything interrupted by a crash
```

## Using the generated design system
* HTML: `kk-design/theme.css` + `motion.js` are linked automatically. Use `.kk-btn`, `.kk-card`, `.kk-nav`, `.kk-sidebar`, `.kk-table-wrap`, `.kk-carousel`, `<dialog>`; opt-in motion with `data-kk-reveal`, `data-kk-parallax`, `.kk-3d`.
* React / Next.js: `import { KkButton, KkCard, KkInput, KkModal, KkTable, KkNav, KkSidebarLayout, KkChart, KkCarousel, KkThemeProvider, KkThemeToggle } from './kk-design'`.
* Tailwind v4: utilities `bg-kk-primary`, `text-kk-text`, `font-kk-display`, `rounded-kk-md`, `shadow-kk-md` are exposed through the `@theme inline` bridge.
* Themes: `data-theme="light|dark|high-contrast"` on `<html>` (persisted by `kkTheme.set()`), `prefers-color-scheme`, `prefers-contrast`, `forced-colors` and `prefers-reduced-motion` are honoured automatically.
