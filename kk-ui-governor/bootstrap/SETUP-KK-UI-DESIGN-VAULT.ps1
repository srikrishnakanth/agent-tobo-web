<#
.SYNOPSIS
  SETUP-KK-UI-DESIGN-VAULT — Windows bootstrap for the KK-UI-GOVERNOR Design Vault.

.DESCRIPTION
  Reproduces the vault setup faithfully on Windows:
    1. Checks prerequisites (Node >= 18, git) and network reachability.
    2. Validates vault-manifest.json (only legally compatible, pinned sources).
    3. Harvests every asset at its pinned commit SHA, verifying each license text.
    4. Normalizes the DESIGN-VAULT tree (assets/, sources/, catalog.json, NOTICES.md, lock file).
    5. Verifies file hashes against the lock file and writes SETUP-REPORT.json.
  The Linux/macOS/cloud equivalent is setup-kk-ui-design-vault.sh; both delegate to the same
  Node core (bootstrap/setup-vault.mjs) so results are identical across platforms.

.PARAMETER VaultDir
  Target directory for the vault (default: <repo>/DESIGN-VAULT).
.PARAMETER Manifest
  Path to vault-manifest.json (default: <repo>/vault-manifest.json).
.PARAMETER Offline
  Use the on-disk cache only (no network).
.PARAMETER VerifyOnly
  Only verify an existing vault against its lock file.
.PARAMETER InstallPlaywright
  Also install the Playwright browser used by the verification suite (npx playwright install chromium).

.NOTES
  -Verbose is the standard CmdletBinding common parameter; passing it forwards --verbose to the Node core.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File bootstrap\SETUP-KK-UI-DESIGN-VAULT.ps1
  powershell -ExecutionPolicy Bypass -File bootstrap\SETUP-KK-UI-DESIGN-VAULT.ps1 -VerifyOnly
#>
[CmdletBinding()]
param(
  [string]$VaultDir = "",
  [string]$Manifest = "",
  [switch]$Offline,
  [switch]$VerifyOnly,
  [switch]$InstallPlaywright
)
# NOTE: do NOT declare a -Verbose switch here. [CmdletBinding()] already supplies -Verbose (and -Debug,
# -ErrorAction, ...) as common parameters; redeclaring one makes PowerShell refuse to bind the command
# with "A parameter with the name 'Verbose' was defined multiple times". Read the common parameter via
# $VerbosePreference instead, which -Verbose sets to 'Continue'.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $VaultDir) { $VaultDir = Join-Path $Root "DESIGN-VAULT" }
if (-not $Manifest) { $Manifest = Join-Path $Root "vault-manifest.json" }

function Write-Step([string]$msg) { Write-Host "[kk-vault] $msg" -ForegroundColor Cyan }
function Fail([string]$msg) { Write-Host "[kk-vault] ERROR: $msg" -ForegroundColor Red; exit 1 }

Write-Step "KK-UI-DESIGN-VAULT bootstrap (Windows)"
Write-Step "Repository root: $Root"

# 1. Prerequisites
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "Node.js >= 18 is required. Install from https://nodejs.org and re-run." }
$nodeVersion = (& node -v).TrimStart('v')
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 18) { Fail "Node.js $nodeVersion found; >= 18 required." }
Write-Step "Node.js $nodeVersion OK"
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) { Write-Step "git $((& git --version).Split(' ')[-1]) OK" } else { Write-Host "[kk-vault] git not found (optional; only needed for provenance tooling)" -ForegroundColor Yellow }

if (-not (Test-Path $Manifest)) { Fail "manifest not found: $Manifest" }
Write-Step "Manifest: $Manifest"
Write-Step "Vault dir: $VaultDir"

# 2. Network check (skipped when offline)
if (-not $Offline -and -not $VerifyOnly) {
  try {
    $resp = Invoke-WebRequest -Uri "https://raw.githubusercontent.com/argyleink/open-props/530682d04327f842f56bb1ec33cf84a3cadb3876/LICENSE" -UseBasicParsing -TimeoutSec 20
    if ($resp.StatusCode -ne 200) { throw "status $($resp.StatusCode)" }
    Write-Step "Network OK (raw.githubusercontent.com reachable)"
  } catch {
    Write-Host "[kk-vault] raw.githubusercontent.com not reachable ($_). Re-run with -Offline if the cache is populated." -ForegroundColor Yellow
  }
}

# 3-5. Delegate to the cross-platform Node core
# $args is an automatic variable in PowerShell - never assign to it. Use an explicit name and splat that.
$nodeArgs = @((Join-Path $PSScriptRoot "setup-vault.mjs"), "--manifest", $Manifest, "--vault-dir", $VaultDir)
if ($Offline) { $nodeArgs += "--offline" }
if ($VerifyOnly) { $nodeArgs += "--verify-only" }
if ($VerbosePreference -ne 'SilentlyContinue') { $nodeArgs += "--verbose" }
Write-Step "Running: node $($nodeArgs -join ' ')"
& node @nodeArgs
$code = $LASTEXITCODE
if ($code -ne 0) { Fail "vault setup failed (exit $code). See $(Join-Path $VaultDir 'SETUP-REPORT.json')" }

# 6. Optional: Playwright browser for the verification suite
if ($InstallPlaywright) {
  Write-Step "Installing Playwright Chromium for the verification suite"
  Push-Location $Root
  try {
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed (exit $LASTEXITCODE); the verification suite will not be able to run" }
    & npx playwright install chromium
    if ($LASTEXITCODE -ne 0) { Fail "playwright install failed (exit $LASTEXITCODE); run 'npx playwright install chromium' manually" }
    Write-Step "Playwright Chromium ready"
  } finally { Pop-Location }
}

Write-Step "Done. Catalog: $(Join-Path $VaultDir 'catalog.json')  Notices: $(Join-Path $VaultDir 'NOTICES.md')  Report: $(Join-Path $VaultDir 'SETUP-REPORT.json')"
Write-Step "Next: node $(Join-Path 'bin' 'kkgov.js') scan <project>   |   node $(Join-Path 'bin' 'kkgov.js') apply <project> --auto"
exit 0
