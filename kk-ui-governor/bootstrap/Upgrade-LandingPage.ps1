<#
.SYNOPSIS
  One-command landing-page upgrade for a Windows project, using KK-UI-GOVERNOR.

.DESCRIPTION
  Runs the whole safe sequence against a project on this machine:

    0. builds the Design Vault if it is missing
    1. deep-scans the project (framework, stack, brand, routes, components, responsive behaviour,
       UX problems, generic-AI patterns)
    2. prints the recommended design direction and the reasoning behind it
    3. DRY RUN: applies the landing-page-only upgrade, verifies it across the device matrix, then
       rolls back regardless of the outcome, so you can read the report before anything is kept
    4. optionally applies for real and leaves the transaction PENDING for you to keep or roll back

  Only the landing page is touched. Every generated CSS rule is confined to a scope root, gate G10
  fails the run if any rule escapes, and the UNCHANGED-ROUTES check captures a computed-style
  signature of your other routes before and after the write and fails if any of them differ.

  Nothing is deployed. Publish with whatever already publishes the site.

.PARAMETER ProjectPath
  Path to the project. Quote it if it contains spaces.

.PARAMETER Style
  premium | modern | minimal | enterprise | luxury | creative | visual-rich | native-app | 3d | data-dense

.PARAMETER Verify
  quick | standard | full. Default standard.

.PARAMETER Apply
  After the dry run, apply for real and leave the transaction pending your decision.

.PARAMETER Theme
  light | dark | high-contrast | auto. Omit to let the scan decide.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File bootstrap\Upgrade-LandingPage.ps1 -ProjectPath "C:\projects\JBRH PRODUCTS\MAYA-DEVICE-SALES-SERVICE\connect-by-jbrh"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File bootstrap\Upgrade-LandingPage.ps1 -ProjectPath "C:\path\to\app" -Style premium -Verify full -Apply
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectPath,
  [ValidateSet('premium', 'modern', 'minimal', 'enterprise', 'luxury', 'creative', 'visual-rich', 'native-app', '3d', 'data-dense')]
  [string]$Style = 'premium',
  [ValidateSet('quick', 'standard', 'full')]
  [string]$Verify = 'standard',
  [ValidateSet('light', 'dark', 'high-contrast', 'auto')]
  [string]$Theme,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Cli = Join-Path $Root (Join-Path 'bin' 'kkgov.js')

function Write-Step([string]$m) { Write-Host "`n[kk-governor] $m" -ForegroundColor Cyan }
function Fail([string]$m) { Write-Host "[kk-governor] ERROR: $m" -ForegroundColor Red; exit 1 }

# ---- prerequisites -----------------------------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js >= 18 is required (https://nodejs.org)" }
$nodeMajor = [int]((& node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { Fail "Node.js $(& node -v) found; >= 18 required" }
if (-not (Test-Path -LiteralPath $ProjectPath)) { Fail "project not found: $ProjectPath" }
if (-not (Test-Path -LiteralPath $Cli)) { Fail "kkgov CLI not found at $Cli" }
Write-Step "Node $(& node -v) | project: $ProjectPath"

# ---- 0. vault ----------------------------------------------------------------------------------
$Vault = Join-Path $Root 'DESIGN-VAULT'
if (-not (Test-Path -LiteralPath (Join-Path $Vault 'catalog.json'))) {
  Write-Step "Design Vault missing - building it (one time, needs network)"
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'SETUP-KK-UI-DESIGN-VAULT.ps1')
  if ($LASTEXITCODE -ne 0) { Fail "vault setup failed" }
} else {
  Write-Step "Design Vault present"
}

# ---- 1. scan -----------------------------------------------------------------------------------
Write-Step "Scanning the project (read-only)"
& node $Cli scan $ProjectPath
if ($LASTEXITCODE -ne 0) { Fail "scan failed" }

# ---- 2. recommend ------------------------------------------------------------------------------
Write-Step "Recommended design direction (no changes made)"
$recArgs = @($Cli, 'recommend', $ProjectPath, '--landing-only', '--style', $Style)
if ($Theme) { $recArgs += @('--theme', $Theme) }
& node @recArgs
if ($LASTEXITCODE -ne 0) { Fail "recommend failed" }

# ---- 3. dry run --------------------------------------------------------------------------------
Write-Step "DRY RUN: apply -> verify on every device -> roll back regardless. Nothing is kept."
$dryArgs = @($Cli, 'apply', $ProjectPath, '--landing-only', '--style', $Style, '--verify', $Verify, '--decide', 'rollback')
if ($Theme) { $dryArgs += @('--theme', $Theme) }
& node @dryArgs
$dry = $LASTEXITCODE
if ($dry -ne 0) {
  Write-Host "`n[kk-governor] The dry run did not pass every gate. Open the REPORT.html above: it lists each failing check, the devices it failed on, and why. Nothing was kept." -ForegroundColor Yellow
  exit $dry
}
Write-Step "Dry run PASSED every gate and was rolled back cleanly."

if (-not $Apply) {
  Write-Host "`n[kk-governor] Re-run with -Apply to apply it for real (the transaction is left PENDING for your decision)." -ForegroundColor Green
  exit 0
}

# ---- 4. apply for real, pending your decision ---------------------------------------------------
Write-Step "APPLYING for real. The transaction is left PENDING - review the site, then keep or roll back."
$applyArgs = @($Cli, 'apply', $ProjectPath, '--landing-only', '--style', $Style, '--verify', $Verify, '--decide', 'ask')
if ($Theme) { $applyArgs += @('--theme', $Theme) }
& node @applyArgs
$code = $LASTEXITCODE
# exit 2 == PENDING (verification passed, awaiting your decision); 3 == STAGED (React/Next: wrap and re-run)
if ($code -eq 3) {
  Write-Host @"

[kk-governor] Design STAGED - it is written but not yet visible anywhere.

  Every safety gate, the probe and your project's own production build passed. To activate it:
    1. Wrap ONLY your landing page's content in <KkScope> (see kk-design/KkScope.tsx)
    2. Re-run this script to verify the applied design across the device matrix

  Nothing else in the app can change until you do step 1 - that is what makes this safe.
"@ -ForegroundColor Green
  exit 0
}
if ($code -ne 2 -and $code -ne 0) { Fail "apply failed (exit $code); the change was rolled back automatically" }

Write-Host @"

[kk-governor] Applied and verified. The transaction is PENDING your decision.

  Review the site, then:
    node "$Cli" status   "$ProjectPath"
    node "$Cli" keep     "$ProjectPath" <txId>
    node "$Cli" rollback "$ProjectPath" <txId>

  React/Next only: the design is staged, not yet visible. Wrap ONLY your landing page's content in
  <KkScope> (see kk-design/KkScope.tsx), then re-run this script to verify the result.

  Deploy with whatever already publishes this site. Afterwards you can check production with:
    node "$Cli" verify "$ProjectPath" --url https://your-site --routes / --verify $Verify
"@ -ForegroundColor Green
exit 0
