# Archived proof reports

Self-contained `REPORT.html` files produced by real runs of the full flow in the cloud environment
(Linux, Node 22, Playwright Chromium). Each report embeds the device-matrix screenshots, safety-gate
results, verification checks (with baseline comparison), the transaction journal and vault provenance.

| Report | Project | Adapter | Mode | Verdict |
|---|---|---|---|---|
| `html-landing-REPORT.html` | `samples/html-landing` (plain HTML/CSS/JS) | html | standard | see file |
| `react-dashboard-REPORT.html` | `samples/react-dashboard` (Vite + React + Tailwind v4) | react | quick | see file |
| `nextjs-host-app-REPORT.html` | host repository (Next.js 14 app router, Tailwind v4 installed) | nextjs | standard | see file |
| `nextjs-host-app-rerun-REPORT.html` | host repository, second run on an already-governed project | nextjs | quick | see file |

Regenerate with `node bin/kkgov.js apply <project> --auto --verify standard`.
