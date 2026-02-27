$ErrorActionPreference = "Continue"

$manifestPath = Join-Path $PSScriptRoot "manifest.xml"
$npxCmd = Join-Path $env:ProgramFiles "nodejs\npx.cmd"
if (-not (Test-Path $npxCmd)) {
  $npxCmd = "npx"
}

Write-Host "[stop] Removing sideloaded add-in..."
& $npxCmd --yes office-addin-dev-settings unregister "$manifestPath" | Out-Host

Write-Host "[stop] Stopping dev server..."
$procs = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -match "Excel plugin[\\\\/]+dev-server\\.js" }

foreach ($p in $procs) {
  try {
    Stop-Process -Id $p.ProcessId -Force
    Write-Host "[stop] Stopped PID $($p.ProcessId)"
  } catch {
    Write-Host "[stop] Failed to stop PID $($p.ProcessId): $($_.Exception.Message)"
  }
}

Write-Host "[stop] Done."
