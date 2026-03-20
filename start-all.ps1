param(
  [switch]$NoSideload
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

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
    [string[]]$Arguments
  )

  if (-not (Test-Path $CliScript)) {
    throw "CLI script not found: $CliScript"
  }

  & $NodeExe $CliScript @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $CliScript $($Arguments -join ' ')"
  }
}

function Test-ServerReady {
  try {
    $null = curl.exe -k -s https://localhost:3000/ws/status
    return $true
  } catch {
    return $false
  }
}

$pluginRoot = (Resolve-Path $PSScriptRoot).Path
$manifestPath = Join-Path $pluginRoot "manifest.xml"
$serverScript = Join-Path $pluginRoot "dev-server.js"
$devSettingsCli = Join-Path $pluginRoot "node_modules\office-addin-dev-settings\cli.js"
$nodeExe = Resolve-NodeExe -Root $pluginRoot

if (-not (Test-Path $manifestPath)) {
  throw "manifest.xml not found: $manifestPath"
}
if (-not (Test-Path $serverScript)) {
  throw "dev-server.js not found: $serverScript"
}
if (-not (Test-Path $devSettingsCli)) {
  throw "office-addin-dev-settings CLI not found. Ensure node_modules is present."
}

Write-Host "[start] Checking for running dev server..."
$existing = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -match "dev-server\.js" -and $_.CommandLine -match [regex]::Escape($pluginRoot) } |
  Select-Object -First 1

if ($existing) {
  Write-Host "[start] Dev server already running (PID $($existing.ProcessId))."
} else {
  Write-Host "[start] Launching dev server..."
  $proc = Start-Process -FilePath $nodeExe -ArgumentList "`"$serverScript`"" -WorkingDirectory $pluginRoot -PassThru
  Write-Host "[start] Dev server PID: $($proc.Id)"
}

Write-Host "[start] Waiting for https://localhost:3000 ..."
for ($i = 0; $i -lt 30; $i++) {
  if (Test-ServerReady) {
    break
  }
  Start-Sleep -Seconds 1
}

if (-not (Test-ServerReady)) {
  if (Test-Path (Join-Path $pluginRoot "dev-server.log")) {
    Write-Host "[start] Last dev-server.log lines:"
    Get-Content -Path (Join-Path $pluginRoot "dev-server.log") -Tail 25 | Out-Host
  }
  throw "Dev server did not become ready on https://localhost:3000"
}

Write-Host "[start] Dev server is ready."

if ($NoSideload) {
  Write-Host "[start] NoSideload set, skipping sideload."
  exit 0
}

Write-Host "[start] Registering and sideloading add-in into Excel..."
Push-Location $pluginRoot
try {
  Invoke-NodeCli -NodeExe $nodeExe -CliScript $devSettingsCli -Arguments @("register", $manifestPath)
  Invoke-NodeCli -NodeExe $nodeExe -CliScript $devSettingsCli -Arguments @("sideload", $manifestPath, "desktop", "--app", "excel")
} finally {
  Pop-Location
}
