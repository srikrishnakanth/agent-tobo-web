# Design Vault provenance

`vault-manifest.json` pins every upstream source to a full commit SHA and declares its SPDX license.
The harvester fetches each file at that commit from `raw.githubusercontent.com/<repo>/<sha>/<path>`,
fetches the source's license file, identifies the license from its text and refuses the source on mismatch.
Font families additionally have their per-family `OFL.txt` verified. Font binaries are **not** vendored.

| Source | Repo @ commit | License | Used for |
|---|---|---|---|
| shadcn-ui | shadcn-ui/ui @ 5c7072d | MIT | button, card, input, table, dialog, sheet, sidebar, navigation-menu, tabs, chart, badge, carousel, skeleton, select, switch, tooltip (intent; converted to dependency-free equivalents) |
| radix-colors | radix-ui/colors @ dbdb854 | MIT | 12-step light/dark scale intent |
| heroicons | tailwindlabs/heroicons @ 616b7a4 | MIT | 16 outline icons |
| lucide | lucide-icons/lucide @ 3859eb2 | ISC (Feather-derived icons MIT) | 17 icons |
| tabler-icons | tabler/tabler-icons @ 55f87a7 | MIT | 10 icons |
| open-props | argyleink/open-props @ 530682d | MIT | shadows, easing, sizes, borders, fonts, media, gradients, z-index, animations |
| pico | picocss/pico @ 1039a47 | MIT | classless CSS + settings |
| daisyui | saadeghi/daisyui @ 1435c65 | MIT | theme + component CSS (requires daisyui) |
| fluentui-tokens | microsoft/fluentui @ 6d627fa | MIT | Windows Fluent tokens |
| material-web | material-components/material-web @ c05b4b2 | Apache-2.0 | Material 3 tokens + filled button |
| ionic | ionic-team/ionic-framework @ 5874331 | MIT | iOS / MD tokens |
| swiper | nolimits4web/swiper @ b378667 | MIT | carousel CSS (intent) |
| threejs | mrdoob/three.js @ 2016416 | MIT | WebGL example (only when `three` exists) |
| motion | motiondivision/motion @ e871ba7 | MIT | package metadata |
| chartjs | chartjs/Chart.js @ cb02e1d | MIT | samples (intent) |
| google-fonts | google/fonts @ 5e35378 | OFL-1.1 (per family) | 20 families (metadata + OFL text) |
| modern-normalize | sindresorhus/modern-normalize @ 27c3f5f | MIT | normalize |

Explicitly excluded (see `excluded` in the manifest): Tailwind Plus/UI, Untitled UI kits, Font Awesome Pro,
elastic/eui (SSPL / Elastic-2.0), MUI X Pro / AG Grid Enterprise, Flowbite Blocks/Pro, GPL/AGPL/LGPL templates,
CC BY-NC / CC BY-SA packs.

Integrity: `DESIGN-VAULT/VAULT-MANIFEST.lock.json` records every file hash; `kkgov vault verify` re-hashes the vault.
