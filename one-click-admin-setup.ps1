param(
  [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Action
  )
  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Action
}

$scriptPath = $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptPath

if (-not (Test-IsAdmin)) {
  Write-Host "Requesting admin approval (UAC)..." -ForegroundColor Yellow
  $args = @(
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$scriptPath`""
  )
  if ($SkipStart) {
    $args += "-SkipStart"
  }
  Start-Process -FilePath "powershell.exe" -ArgumentList $args -Verb RunAs | Out-Null
  exit 0
}

Set-Location $root

Invoke-Step -Title "Running full Office add-in setup (cert + loopback + trust)" -Action {
  npm run setup
}

if (-not $SkipStart) {
  Invoke-Step -Title "Launching dev server + sideloading add-in" -Action {
    npm run start
  }
}

Write-Host ""
Write-Host "All done." -ForegroundColor Green
Write-Host "If Excel is open with an old taskpane, close/reopen the add-in once."
