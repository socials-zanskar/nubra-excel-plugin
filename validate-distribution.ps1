param(
  [string]$BundlePath = ".\ship\NubraExcelPlugin",
  [switch]$WithSideload,
  [switch]$AllowForeignDevServer
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Assert-Exists {
  param([string]$PathValue)
  if (-not (Test-Path $PathValue)) {
    throw "Missing required path: $PathValue"
  }
}

function Get-BundleDevServerProcess {
  param([string]$ServerScriptPath)
  return Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -match [regex]::Escape($ServerScriptPath) } |
    Select-Object -First 1
}

function Get-AllDevServerProcesses {
  return Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -match "dev-server\.js" }
}

function Test-ServerReady {
  try {
    $null = curl.exe -k -s https://localhost:3000/ws/status
    return $true
  } catch {
    return $false
  }
}

$bundleRoot = (Resolve-Path $BundlePath).Path
$bundleServerScript = Join-Path $bundleRoot "dev-server.js"
Write-Host "[validate] Bundle: $bundleRoot"

$required = @(
  "NubraExcelLauncher.exe",
  "setup-local.ps1",
  "start-all.ps1",
  "stop-all.ps1",
  "dev-server.js",
  "manifest.xml",
  "taskpane.js",
  "taskpane.html",
  "taskpane.css",
  "runtime\node\node.exe",
  "node_modules\office-addin-dev-settings\cli.js",
  "node_modules\office-addin-dev-certs\cli.js"
)

foreach ($item in $required) {
  Assert-Exists (Join-Path $bundleRoot $item)
}
Write-Host "[validate] Required files present."

$existingDevServers = @(Get-AllDevServerProcesses)
if ($existingDevServers.Count -gt 0) {
  $foreign = @($existingDevServers | Where-Object { $_.CommandLine -notmatch [regex]::Escape($bundleServerScript) })
  if ($foreign.Count -gt 0 -and -not $AllowForeignDevServer) {
    throw "Another dev-server.js process is already running from a different path. Stop it before distribution validation or rerun with -AllowForeignDevServer."
  }
  if ($foreign.Count -gt 0 -and $AllowForeignDevServer) {
    Write-Host "[validate] Warning: foreign dev-server.js process detected. Continuing due to -AllowForeignDevServer."
  }
}

Push-Location $bundleRoot
try {
  $nodeExe = Join-Path $bundleRoot "runtime\node\node.exe"
  & $nodeExe -v | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Bundled node runtime failed to execute."
  }

  $startArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $bundleRoot "start-all.ps1"))
  if (-not $WithSideload) { $startArgs += "-NoSideload" }
  Write-Host "[validate] Starting bundle server..."
  & powershell.exe @startArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Bundle start-all.ps1 failed."
  }

  $proc = Get-BundleDevServerProcess -ServerScriptPath $bundleServerScript
  if (-not $proc) {
    throw "Bundle dev-server process not detected for $bundleRoot. Port 3000 may be occupied by another process."
  }
  Write-Host "[validate] Bundle dev-server PID: $($proc.ProcessId)"

  if (-not (Test-ServerReady)) {
    throw "Local server readiness check failed on https://localhost:3000/ws/status"
  }
  Write-Host "[validate] Local server health endpoint reachable."

  Write-Host "[validate] Stopping bundle server..."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $bundleRoot "stop-all.ps1")
  if ($LASTEXITCODE -ne 0) {
    throw "Bundle stop-all.ps1 failed."
  }
  Start-Sleep -Seconds 1

  $procAfter = Get-BundleDevServerProcess -ServerScriptPath $bundleServerScript
  if ($procAfter) {
    throw "Bundle dev-server process still running (PID $($procAfter.ProcessId))."
  }

  Write-Host "[validate] Distribution validation passed."
} finally {
  Pop-Location
}
