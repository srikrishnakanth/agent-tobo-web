#!/usr/bin/env bash
# setup-kk-ui-design-vault.sh — Linux / macOS / cloud bootstrap for the KK-UI-GOVERNOR Design Vault.
# Faithful cross-platform reproduction of SETUP-KK-UI-DESIGN-VAULT.ps1: same steps, same Node core.
#
#   1. prerequisites (node >= 18, git optional, network)
#   2. validate vault-manifest.json
#   3. harvest every asset at its pinned commit, verifying license texts
#   4. normalize DESIGN-VAULT (assets/, sources/, catalog.json, NOTICES.md, lock)
#   5. verify hashes + write SETUP-REPORT.json
#
# Usage: bootstrap/setup-kk-ui-design-vault.sh [--vault-dir DIR] [--manifest FILE] [--offline] [--verify-only] [--install-playwright] [--verbose]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VAULT_DIR="$ROOT/DESIGN-VAULT"; MANIFEST="$ROOT/vault-manifest.json"; OFFLINE=""; VERIFY_ONLY=""; INSTALL_PW=""; VERBOSE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault-dir) VAULT_DIR="$2"; shift 2;;
    --manifest) MANIFEST="$2"; shift 2;;
    --offline) OFFLINE="--offline"; shift;;
    --verify-only) VERIFY_ONLY="--verify-only"; shift;;
    --install-playwright) INSTALL_PW=1; shift;;
    --verbose) VERBOSE="--verbose"; shift;;
    -h|--help) sed -n '2,12p' "$0"; exit 0;;
    *) echo "unknown option: $1" >&2; exit 1;;
  esac
done
step() { printf '\033[36m[kk-vault]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[kk-vault] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

step "KK-UI-DESIGN-VAULT bootstrap ($(uname -s))"
step "Repository root: $ROOT"
command -v node >/dev/null 2>&1 || fail "Node.js >= 18 is required (https://nodejs.org)"
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
[[ "$NODE_MAJOR" -ge 18 ]] || fail "Node.js $(node -v) found; >= 18 required"
step "Node.js $(node -v) OK"
if command -v git >/dev/null 2>&1; then step "git $(git --version | awk '{print $3}') OK"; else step "git not found (optional)"; fi
[[ -f "$MANIFEST" ]] || fail "manifest not found: $MANIFEST"
step "Manifest: $MANIFEST"; step "Vault dir: $VAULT_DIR"

if [[ -z "$OFFLINE" && -z "$VERIFY_ONLY" ]]; then
  if curl -fsS --max-time 20 -o /dev/null "https://raw.githubusercontent.com/argyleink/open-props/530682d04327f842f56bb1ec33cf84a3cadb3876/LICENSE" 2>/dev/null; then step "Network OK (raw.githubusercontent.com reachable)"; else step "WARNING: raw.githubusercontent.com not reachable via curl; the Node harvester will still try (it honours HTTPS_PROXY / NODE_EXTRA_CA_CERTS). Use --offline with a populated cache if needed."; fi
fi

step "Running: node $HERE/setup-vault.mjs --manifest $MANIFEST --vault-dir $VAULT_DIR $OFFLINE $VERIFY_ONLY $VERBOSE"
node "$HERE/setup-vault.mjs" --manifest "$MANIFEST" --vault-dir "$VAULT_DIR" $OFFLINE $VERIFY_ONLY $VERBOSE || fail "vault setup failed. See $VAULT_DIR/SETUP-REPORT.json"

if [[ -n "$INSTALL_PW" ]]; then
  step "Installing Playwright Chromium for the verification suite"
  (cd "$ROOT" && npm install --no-audit --no-fund && npx playwright install chromium)
fi
step "Done. Catalog: $VAULT_DIR/catalog.json  Notices: $VAULT_DIR/NOTICES.md  Report: $VAULT_DIR/SETUP-REPORT.json"
step "Next: node bin/kkgov.js scan <project>   |   node bin/kkgov.js apply <project> --auto"
