# Safety model

| Rule | Mechanism |
|---|---|
| Never overwrite the original without backup / transaction protection | `Transaction.applyOps`: write-ahead `journal.jsonl` (fsync), byte-exact backup with hash verification, atomic temp-file + rename write, post-write audit |
| Never remove working business functionality for visual reasons | Gate **G2 additive-only-edits**: candidate content minus governor marker blocks must equal the original byte-for-byte (whitespace-normalised) |
| Never replace existing brand identity unless the mode allows it | Gate **G3**: candidate primary must equal the detected brand primary unless `brandMode=replace` (`--brand-mode replace` or platform `brand-custom`) |
| Never introduce a new dependency unless necessary and verified | Gate **G1**: `plan.dependencies` must already be in `package.json`; adapters emit dependency-free equivalents |
| Never bundle incompatible licenses; preserve notices | SPDX allow/deny policy (`src/core/licenses.js`), license text verification at harvest, `NOTICES.md`, per-candidate `ATTRIBUTION.md`, gate **G4** |
| Failed candidate rolls back automatically | `Governor.apply`: verification failure ⇒ `tx.rollback()`; every restored file is hash-checked against its backup |
| Crash safety | Any transaction left in `writing`/`written`/`verified` is rolled back by `recoverAll` at the next run or `kkgov recover` |
| Partial success is not completion | Static-only verification, unsupported frameworks and gate failures all yield verdict `FAIL` / `UNSUPPORTED`; only a green Verify + keep yields `PASS` |
| Path safety | Gate **G5**: relative paths only, no `..`, protected files (`package.json`, lockfiles, `.env*`, configs, `.git`, `node_modules`) are never written |
| Heavy motion / 3D | Gate **G9** requires fallback policy; runtime degrades on reduced-motion, save-data, low-end hardware, touch/narrow viewports, and after a frame-time budget breach |

Manual rollback at any time: `kkgov rollback <project> <txId>` (works on kept transactions; backups are retained).
