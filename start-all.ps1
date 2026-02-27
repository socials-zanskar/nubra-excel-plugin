param(
  [switch]$NoSideload
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$pluginRoot = Resolve-Path $PSScriptRoot
$manifestPath = Join-Path $PSScriptRoot "manifest.xml"
$serverScript = Join-Path $PSScriptRoot "dev-server.js"

if (-not (Test-Path $manifestPath)) {
  throw "manifest.xml not found: $manifestPath"
}
if (-not (Test-Path $serverScript)) {
  throw "dev-server.js not found: $serverScript"
}

$npxCmd = Join-Path $env:ProgramFiles "nodejs\npx.cmd"
if (-not (Test-Path $npxCmd)) {
  $npxCmd = "npx"
}

function Test-ServerReady {
  try {
    $null = curl.exe -k -s https://localhost:3000/ws/status
    return $true
  } catch {
    return $false
  }
}

Write-Host "[start] Checking for running dev server..."
$existing = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -match "Excel plugin[\\\\/]+dev-server\\.js" } |
  Select-Object -First 1

if ($existing) {
  Write-Host "[start] Dev server already running (PID $($existing.ProcessId))."
} else {
  Write-Host "[start] Launching dev server..."
  $proc = Start-Process -FilePath "node" -ArgumentList "`"$serverScript`"" -WorkingDirectory $pluginRoot -PassThru
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
  if (Test-Path (Join-Path $PSScriptRoot "dev-server.log")) {
    Write-Host "[start] Last dev-server.log lines:"
    Get-Content -Path (Join-Path $PSScriptRoot "dev-server.log") -Tail 25 | Out-Host
  }
  throw "Dev server did not become ready on https://localhost:3000"
}

Write-Host "[start] Dev server is ready."

if ($NoSideload) {
  Write-Host "[start] NoSideload set, skipping sideload."
  exit 0
}

Write-Host "[start] Sideloading add-in into Excel..."
Push-Location $pluginRoot
try {
  & $npxCmd --yes office-addin-dev-settings register "$manifestPath"
  if ($LASTEXITCODE -ne 0) { throw "register failed with exit code $LASTEXITCODE" }
  & $npxCmd --yes office-addin-dev-settings sideload "$manifestPath" desktop --app excel
  if ($LASTEXITCODE -ne 0) { throw "sideload failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
