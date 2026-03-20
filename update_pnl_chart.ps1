$ErrorActionPreference='Stop'
param(
  [string]$file = ".\\RSI_LongOnly_Reliance_Backtest.xlsx"
)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $null
$ws = $null
try {
  $wb = $excel.Workbooks.Open($file)
  $ws = $wb.Worksheets.Item('PasteData')

  # Named range for cumulative PnL (column U)
  try { $wb.Names.Item('PnlRange').Delete() } catch {}
  $null = $wb.Names.Add('PnlRange','=OFFSET(PasteData!$U$2,0,0,DataRows,1)')

  # Ensure cumulative PnL starts at zero in row 2
  $ws.Range('U2').Formula = '=0'

  # Update second chart to PnL vs Time
  if ($ws.ChartObjects().Count -ge 2) {
    $ch2 = $ws.ChartObjects(2).Chart
    $ch2.HasTitle = $true
    $ch2.ChartTitle.Text = 'Cumulative PnL (Starts at 0)'

    # Clear and recreate series
    while ($ch2.SeriesCollection().Count -gt 0) { $ch2.SeriesCollection(1).Delete() }
    $s = $ch2.SeriesCollection().NewSeries()
    $s.Name = '="CumPnL"'
    $s.XValues = '=PasteData!TsRange'
    $s.Values = '=PasteData!PnlRange'
  }

  $wb.Save()
  $wb.Close($true)
  Write-Output "Updated: $file"
}
finally {
  $excel.Quit()
  if ($ws -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) }
  if ($wb -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
