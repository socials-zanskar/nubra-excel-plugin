param(
  [switch]$SkipZip,
  [switch]$SkipNodeModules
)

$ErrorActionPreference = "Stop"

function Invoke-RobocopyTree {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (-not (Test-Path $Source)) {
    throw "Source not found: $Source"
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $null = robocopy $Source $Destination /MIR /R:1 /W:1 /NFL /NDL /NP /NJH /NJS /XF *.log
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed for $Source -> $Destination (exit $LASTEXITCODE)"
  }
}

$pluginRoot = (Resolve-Path $PSScriptRoot).Path
$shipRoot = Join-Path $pluginRoot "ship"
$bundleRoot = Join-Path $shipRoot "NubraExcelPlugin"
$zipPath = Join-Path $pluginRoot "NubraExcelPlugin.zip"
$runtimeRoot = Join-Path $bundleRoot "runtime\node"
$systemNodeRoot = Join-Path $env:ProgramFiles "nodejs"

if (-not (Test-Path (Join-Path $pluginRoot "node_modules")) -and -not $SkipNodeModules) {
  throw "node_modules not found. Run setup first so the distribution can ship local Office tooling."
}

if (-not (Test-Path (Join-Path $systemNodeRoot "node.exe"))) {
  throw "System Node runtime not found at $systemNodeRoot. Install Node once on the build machine."
}

if (Test-Path $shipRoot) {
  Remove-Item -Recurse -Force $shipRoot
}
if ((-not $SkipZip) -and (Test-Path $zipPath)) {
  Remove-Item -Force $zipPath
}

New-Item -ItemType Directory -Path $bundleRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleRoot "icons") | Out-Null
New-Item -ItemType Directory -Path $runtimeRoot | Out-Null

$filesToCopy = @(
  "commands.html",
  "commands.js",
  "dev-server.js",
  "manifest.xml",
  "setup-local.ps1",
  "start-all.ps1",
  "stop-all.ps1",
  "taskpane.css",
  "taskpane.html",
  "taskpane.js",
  "package.json",
  "package-lock.json",
  "README.md",
  "ORDER_STRATEGY_API_CONTRACT.md",
  "ORDER_STRATEGY_PHASE0.md"
)

foreach ($file in $filesToCopy) {
  Copy-Item -Path (Join-Path $pluginRoot $file) -Destination (Join-Path $bundleRoot $file) -Force
}

Invoke-RobocopyTree -Source (Join-Path $pluginRoot "icons") -Destination (Join-Path $bundleRoot "icons")
if (-not $SkipNodeModules) {
  Write-Host "[build] Copying node_modules (this can take time)..."
  Invoke-RobocopyTree -Source (Join-Path $pluginRoot "node_modules") -Destination (Join-Path $bundleRoot "node_modules")
}

Copy-Item -Path (Join-Path $systemNodeRoot "node.exe") -Destination (Join-Path $runtimeRoot "node.exe") -Force

$launcherSource = Join-Path $pluginRoot "launcher.cs"
$launcherExe = Join-Path $bundleRoot "NubraExcelLauncher.exe"

$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $cscPath)) {
  $cscPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $cscPath)) {
  throw "csc.exe not found in .NET Framework paths."
}

& $cscPath /nologo /target:exe /out:$launcherExe $launcherSource
if ($LASTEXITCODE -ne 0) {
  throw "Failed to compile launcher.cs"
}

Write-Host "[build] EXE: $launcherExe"
Write-Host "[build] Bundle folder: $bundleRoot"
Write-Host "[build] Bundled Node runtime: $runtimeRoot"

if (-not $SkipZip) {
  Write-Host "[build] Creating zip archive..."
  Compress-Archive -Path (Join-Path $bundleRoot "*") -DestinationPath $zipPath -Force
  Write-Host "[build] ZIP: $zipPath"
} else {
  Write-Host "[build] SkipZip set; ZIP not created."
}
