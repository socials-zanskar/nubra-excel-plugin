$ErrorActionPreference = "Stop"

$pluginRoot = Resolve-Path $PSScriptRoot
$shipRoot = Join-Path $pluginRoot "ship"
$bundleRoot = Join-Path $shipRoot "NubraExcelPlugin"
$zipPath = Join-Path $pluginRoot "NubraExcelPlugin.zip"

if (Test-Path $shipRoot) {
  Remove-Item -Recurse -Force $shipRoot
}
if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

New-Item -ItemType Directory -Path $bundleRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleRoot "icons") | Out-Null

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
  "README.md"
)

foreach ($file in $filesToCopy) {
  Copy-Item -Path (Join-Path $pluginRoot $file) -Destination (Join-Path $bundleRoot $file) -Force
}

Copy-Item -Path (Join-Path $pluginRoot "icons\*") -Destination (Join-Path $bundleRoot "icons") -Recurse -Force

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

Compress-Archive -Path (Join-Path $bundleRoot "*") -DestinationPath $zipPath -Force

Write-Host "[build] EXE: $launcherExe"
Write-Host "[build] ZIP: $zipPath"
