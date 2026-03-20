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

function Resolve-NodeExe {
  param([string]$Root)

  $candidates = @(
    (Join-Path $Root "runtime\node\node.exe"),
    (Join-Path $env:ProgramFiles "nodejs\node.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  $cmd = Get-Command "node" -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw "Node.js runtime not found. Expected bundled runtime at .\runtime\node\node.exe or a system node.exe."
}

function Invoke-NodeCli {
  param(
    [string]$NodeExe,
    [string]$CliScript,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  if (-not (Test-Path $CliScript)) {
    throw "CLI script not found: $CliScript"
  }

  & $NodeExe $CliScript @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $CliScript $($Arguments -join ' ')"
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

$pluginRoot = (Resolve-Path $PSScriptRoot).Path
$manifestPath = Join-Path $pluginRoot "manifest.xml"
$nodeModulesPath = Join-Path $pluginRoot "node_modules"
$devCertCli = Join-Path $pluginRoot "node_modules\office-addin-dev-certs\cli.js"
$devSettingsCli = Join-Path $pluginRoot "node_modules\office-addin-dev-settings\cli.js"
$nodeExe = Resolve-NodeExe -Root $pluginRoot

if (-not (Test-Path $manifestPath)) {
  throw "manifest.xml not found: $manifestPath"
}

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

Push-Location $pluginRoot
try {
  if (-not $SkipNpmInstall) {
    if (-not (Test-Path $nodeModulesPath)) {
      $npmCli = Join-Path (Split-Path $nodeExe -Parent) "node_modules\npm\bin\npm-cli.js"
      if (-not (Test-Path $npmCli)) {
        throw "npm CLI not found. Bundled installs require node_modules to already be present or a system npm installation."
      }
      Write-Host "[setup] Installing npm packages..."
      & $nodeExe $npmCli install
      if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
    } else {
      Write-Host "[setup] node_modules already present, skipping npm install."
    }
  }

  if (-not (Test-Path $devCertCli)) {
    throw "office-addin-dev-certs CLI not found. Ensure node_modules is present."
  }
  if (-not (Test-Path $devSettingsCli)) {
    throw "office-addin-dev-settings CLI not found. Ensure node_modules is present."
  }

  if (Test-TrustedLocalhostCert) {
    Write-Host "[setup] Trusted localhost certificate already present, skipping cert install."
  } else {
    Write-Host "[setup] Installing and trusting Office dev certificate..."
    Invoke-NodeCli -NodeExe $nodeExe -CliScript $devCertCli -Arguments @("install") -WorkingDirectory $pluginRoot
  }

  Write-Host "[setup] Enabling loopback for Office app container..."
  Invoke-NodeCli -NodeExe $nodeExe -CliScript $devSettingsCli -Arguments @("appcontainer", $manifestPath, "--loopback", "-y") -WorkingDirectory $pluginRoot

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
