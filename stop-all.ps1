$ErrorActionPreference = "Continue"

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

  return $null
}

function Invoke-NodeCli {
  param(
    [string]$NodeExe,
    [string]$CliScript,
    [string[]]$Arguments
  )

  if (-not $NodeExe -or -not (Test-Path $CliScript)) {
    return
  }

  & $NodeExe $CliScript @Arguments | Out-Host
}

$pluginRoot = (Resolve-Path $PSScriptRoot).Path
$manifestPath = Join-Path $pluginRoot "manifest.xml"
$devSettingsCli = Join-Path $pluginRoot "node_modules\office-addin-dev-settings\cli.js"
$nodeExe = Resolve-NodeExe -Root $pluginRoot

Write-Host "[stop] Removing sideloaded add-in..."
Invoke-NodeCli -NodeExe $nodeExe -CliScript $devSettingsCli -Arguments @("unregister", $manifestPath)

Write-Host "[stop] Stopping dev server..."
$procs = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -match "dev-server\.js" -and $_.CommandLine -match [regex]::Escape($pluginRoot) }

foreach ($p in $procs) {
  try {
    Stop-Process -Id $p.ProcessId -Force
    Write-Host "[stop] Stopped PID $($p.ProcessId)"
  } catch {
    Write-Host "[stop] Failed to stop PID $($p.ProcessId): $($_.Exception.Message)"
  }
}

Write-Host "[stop] Done."
