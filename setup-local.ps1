param(
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Test-TrustedLocalhostCert {
  $stores = @("Cert:\CurrentUser\Root", "Cert:\LocalMachine\Root")
  foreach ($store in $stores) {
    try {
      $cert = Get-ChildItem -Path $store -ErrorAction Stop |
        Where-Object { $_.Subject -like "*CN=localhost*" -and $_.NotAfter -gt (Get-Date) } |
        Select-Object -First 1
      if ($cert) { return $true }
    } catch {
      # ignore
    }
  }
  return $false
}

Write-Host "[setup] Checking prerequisites..."
Require-Command "node"

if (-not (Test-IsAdmin)) {
  Write-Host "[setup] Admin rights required for loopback exemptions. Requesting elevation..."
  $argList = @(
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`""
  )
  if ($SkipNpmInstall) {
    $argList += "-SkipNpmInstall"
  }

  $proc = Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs -Wait -PassThru
  exit $proc.ExitCode
}

$npxCmd = Join-Path $env:ProgramFiles "nodejs\npx.cmd"
if (-not (Test-Path $npxCmd)) {
  $npxCmd = "npx"
}

$pluginRoot = Resolve-Path $PSScriptRoot
$manifestPath = Join-Path $PSScriptRoot "manifest.xml"

if (-not (Test-Path $manifestPath)) {
  throw "manifest.xml not found: $manifestPath"
}

Push-Location $pluginRoot
try {
  if (-not $SkipNpmInstall) {
    if (-not (Test-Path (Join-Path $pluginRoot "node_modules"))) {
      Write-Host "[setup] Installing npm packages..."
      npm install
      if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
    } else {
      Write-Host "[setup] node_modules already present, skipping npm install."
    }
  }

  if (Test-TrustedLocalhostCert) {
    Write-Host "[setup] Trusted localhost certificate already present, skipping cert install."
  } else {
    Write-Host "[setup] Installing and trusting Office dev certificate..."
    & $npxCmd --yes office-addin-dev-certs install
    if ($LASTEXITCODE -ne 0) { throw "office-addin-dev-certs install failed with exit code $LASTEXITCODE" }
  }

  Write-Host "[setup] Enabling loopback for Office app container..."
  & $npxCmd --yes office-addin-dev-settings appcontainer "$manifestPath" --loopback -y
  if ($LASTEXITCODE -ne 0) { throw "office-addin-dev-settings appcontainer failed with exit code $LASTEXITCODE" }

  Write-Host "[setup] Adding explicit loopback exemptions..."
  cmd /c "CheckNetIsolation LoopbackExempt -a -n=Microsoft.Win32WebViewHost_cw5n1h2txyewy" | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "CheckNetIsolation (Win32WebViewHost) failed with exit code $LASTEXITCODE" }
  cmd /c "CheckNetIsolation LoopbackExempt -a -n=Microsoft.MicrosoftOfficeHub_8wekyb3d8bbwe" | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "CheckNetIsolation (OfficeHub) failed with exit code $LASTEXITCODE" }

  Write-Host ""
  Write-Host "[setup] Completed."
  Write-Host "[setup] Next: run start-all.ps1 to launch server + sideload."
} finally {
  Pop-Location
}
