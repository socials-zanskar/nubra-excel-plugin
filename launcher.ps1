$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

$pluginRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $pluginRoot

Write-Host "[launcher] Starting Nubra Excel Plugin..."
Write-Host "[launcher] Folder: $pluginRoot"

Require-Command "node"
Require-Command "npm"

$setupScript = Join-Path $pluginRoot "setup-local.ps1"
$startScript = Join-Path $pluginRoot "start-all.ps1"
$setupMarker = Join-Path $pluginRoot ".setup-complete"

if (-not (Test-Path $setupScript)) {
  throw "setup-local.ps1 not found at $setupScript"
}
if (-not (Test-Path $startScript)) {
  throw "start-all.ps1 not found at $startScript"
}

if (Test-Path $setupMarker) {
  Write-Host "[launcher] Setup already completed. Skipping one-time setup."
} else {
  Write-Host "[launcher] Running one-time setup..."
  $setupArgs = @("-ExecutionPolicy", "Bypass", "-File", $setupScript)
  if (Test-Path (Join-Path $pluginRoot "node_modules")) {
    $setupArgs += "-SkipNpmInstall"
  }
  & powershell @setupArgs
  if ($LASTEXITCODE -ne 0) {
    throw "setup-local.ps1 failed with exit code $LASTEXITCODE"
  }
  Set-Content -Path $setupMarker -Value ("setup-complete=" + (Get-Date).ToString("s")) -Encoding UTF8
}

& powershell -ExecutionPolicy Bypass -File $startScript
if ($LASTEXITCODE -ne 0) {
  throw "start-all.ps1 failed with exit code $LASTEXITCODE"
}

Write-Host "[launcher] Completed."
