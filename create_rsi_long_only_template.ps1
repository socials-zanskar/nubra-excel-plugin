$ErrorActionPreference='Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$outFile = Join-Path $desktop 'RSI_LongOnly_Reliance_Backtest.xlsx'
if (Test-Path $outFile) { Remove-Item $outFile -Force }

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $null
$ws = $null
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $ws.Name = 'PasteData'

  # Headers
  $headers = @(
    'ts_ist','close','open','high','low',
    'Change','Gain','Loss','AvgGain','AvgLoss','RSI',
    'EntrySignal','ExitSignal','ActionExec','Position','EntryPrice','ExitPrice',
    'GrossPnL','Cost','NetPnL','CumPnL','Equity'
  )
  for($i=0; $i -lt $headers.Count; $i++) { $ws.Cells.Item(1,$i+1).Value2 = $headers[$i] }

  # Params (N:O area)
  $ws.Cells.Item(1,14).Value2 = 'RSI Length'
  $ws.Cells.Item(2,14).Value2 = 'Buy RSI'
  $ws.Cells.Item(3,14).Value2 = 'TP RSI'
  $ws.Cells.Item(4,14).Value2 = 'SL RSI'
  $ws.Cells.Item(5,14).Value2 = 'Cost %'
  $ws.Cells.Item(6,14).Value2 = 'Start Equity'

  $ws.Cells.Item(1,15).Value2 = 14
  $ws.Cells.Item(2,15).Value2 = 60
  $ws.Cells.Item(3,15).Value2 = 80
  $ws.Cells.Item(4,15).Value2 = 50
  $ws.Cells.Item(5,15).Value2 = 0.001
  $ws.Cells.Item(6,15).Value2 = 100000

  # Row 2 seeds
  $ws.Range('F2').Formula = '=""'
  $ws.Range('G2').Formula = '=""'
  $ws.Range('H2').Formula = '=""'
  $ws.Range('I2').Formula = '=""'
  $ws.Range('J2').Formula = '=""'
  $ws.Range('K2').Formula = '=""'
  $ws.Range('L2').Formula = '=""'
  $ws.Range('M2').Formula = '=""'
  $ws.Range('N2').Formula = '=""'
  $ws.Range('O2').Formula = '=0'
  $ws.Range('P2').Formula = '=""'
  $ws.Range('Q2').Formula = '=""'
  $ws.Range('R2').Formula = '=0'
  $ws.Range('S2').Formula = '=0'
  $ws.Range('T2').Formula = '=0'
  $ws.Range('U2').Formula = '=T2'
  $ws.Range('V2').Formula = '=$O$6+U2'

  # Main formulas from row 3
  $ws.Range('F3').Formula = '=IF(B3="","",B3-B2)'
  $ws.Range('G3').Formula = '=IF(F3="","",MAX(F3,0))'
  $ws.Range('H3').Formula = '=IF(F3="","",MAX(-F3,0))'

  # Wilder avg gain/loss with dynamic seed row based on RSI length (O1)
  $ws.Range('I3').Formula = '=IF(B3="","",IF(ROW()=2+$O$1,AVERAGE(INDEX($G:$G,3):INDEX($G:$G,2+$O$1)),IF(ROW()>2+$O$1,(I2*($O$1-1)+G3)/$O$1,"")))'
  $ws.Range('J3').Formula = '=IF(B3="","",IF(ROW()=2+$O$1,AVERAGE(INDEX($H:$H,3):INDEX($H:$H,2+$O$1)),IF(ROW()>2+$O$1,(J2*($O$1-1)+H3)/$O$1,"")))'
  $ws.Range('K3').Formula = '=IF(B3="","",IF(ROW()<2+$O$1,"",IF(J3=0,100,100-(100/(1+I3/J3)))))'

  # Signals based on previous position to avoid circular refs
  $ws.Range('L3').Formula = '=IF(B3="","",IF(O2=1,"",IF(AND(K2<=$O$2,K3>$O$2),"BUY_SIG","")))'
  $ws.Range('M3').Formula = '=IF(B3="","",IF(O2<>1,"",IF(K3>=$O$3,"EXIT_TP_RSI",IF(K3<=$O$4,"EXIT_SL_RSI",""))))'

  # Execute previous row signal at current open (next-candle execution)
  $ws.Range('N3').Formula = '=IF(B3="","",IF(L2="BUY_SIG","BUY",IF(LEFT(M2,4)="EXIT","SELL","")))'

  # Position and trade bookkeeping
  $ws.Range('O3').Formula = '=IF(B3="","",IF(N3="BUY",1,IF(N3="SELL",0,O2)))'
  $ws.Range('P3').Formula = '=IF(B3="","",IF(N3="BUY",C3,IF(O3=1,P2,"")))'
  $ws.Range('Q3').Formula = '=IF(B3="","",IF(N3="SELL",C3,""))'

  # PnL (1 unit), costs charged on executions
  $ws.Range('R3').Formula = '=IF(B3="","",IF(N3="SELL",C3-P2,0))'
  $ws.Range('S3').Formula = '=IF(B3="","",IF(N3="BUY",C3*$O$5,IF(N3="SELL",C3*$O$5,0)))'
  $ws.Range('T3').Formula = '=IF(B3="","",IF(N3="BUY",-S3,IF(N3="SELL",R3-S3,0)))'
  $ws.Range('U3').Formula = '=IF(B3="","",U2+T3)'
  $ws.Range('V3').Formula = '=IF(B3="","",$O$6+U3)'

  $maxRow = 20000
  $ws.Range('F3:V3').AutoFill($ws.Range("F3:V$maxRow"))

  # Formatting
  $ws.Range('A1:V1').Font.Bold = $true
  $ws.Range('A1:V1').Interior.Color = 0xD9E1F2

  $ws.Range('N1:N6').Font.Bold = $true
  $ws.Range('N1:O6').Borders.LineStyle = 1
  $ws.Range('O5').NumberFormat = '0.0000%'
  $ws.Range('O6').NumberFormat = '#,##0.00'

  $ws.Range("A2:A$maxRow").NumberFormat = 'dd/mm/yyyy, hh:mm:ss'
  $ws.Range("B2:E$maxRow").NumberFormat = '#,##0.00'
  $ws.Range("I2:J$maxRow").NumberFormat = '0.0000'
  $ws.Range("K2:K$maxRow").NumberFormat = '0.00'
  $ws.Range("P2:Q$maxRow").NumberFormat = '#,##0.00'
  $ws.Range("R2:V$maxRow").NumberFormat = '#,##0.00'

  # Conditional formatting for signals/actions
  $entryRange = $ws.Range("L2:L$maxRow")
  $fcBuySig = $entryRange.FormatConditions.Add(1,3,'="BUY_SIG"')
  $fcBuySig.Font.Color = 0x006100
  $fcBuySig.Interior.Color = 0xC6EFCE

  $exitRange = $ws.Range("M2:M$maxRow")
  $fcExit = $exitRange.FormatConditions.Add(2,7,'="EXIT_*"')
  $fcExit.Font.Color = 0x9C6500
  $fcExit.Interior.Color = 0xFFEB9C

  $actRange = $ws.Range("N2:N$maxRow")
  $fcBuy = $actRange.FormatConditions.Add(1,3,'="BUY"')
  $fcBuy.Font.Color = 0x006100
  $fcBuy.Interior.Color = 0xC6EFCE
  $fcSell = $actRange.FormatConditions.Add(1,3,'="SELL"')
  $fcSell.Font.Color = 0x9C0006
  $fcSell.Interior.Color = 0xFFC7CE

  # Dynamic named ranges for charts
  $null = $wb.Names.Add('DataRows','=MAX(1,COUNTA(PasteData!$B:$B)-1)')
  $null = $wb.Names.Add('TsRange','=OFFSET(PasteData!$A$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('CloseRange','=OFFSET(PasteData!$B$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('RsiRange','=OFFSET(PasteData!$K$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('EquityRange','=OFFSET(PasteData!$V$2,0,0,DataRows,1)')

  # Chart 1: Close + RSI (right side)
  $left1 = $ws.Range('W2').Left
  $top1 = $ws.Range('W2').Top
  $right1 = $ws.Range('AF2').Left + $ws.Range('AF2').Width
  $bottom1 = $ws.Range('W20').Top + $ws.Range('W20').Height
  $ch1Obj = $ws.ChartObjects().Add($left1, $top1, ($right1-$left1), ($bottom1-$top1))
  $ch1 = $ch1Obj.Chart
  $ch1.ChartType = 4
  $ch1.HasTitle = $true
  $ch1.ChartTitle.Text = 'Close and RSI'
  $s1 = $ch1.SeriesCollection().NewSeries()
  $s1.Name = '="Close"'
  $s1.XValues = '=PasteData!TsRange'
  $s1.Values = '=PasteData!CloseRange'
  $s2 = $ch1.SeriesCollection().NewSeries()
  $s2.Name = '="RSI"'
  $s2.XValues = '=PasteData!TsRange'
  $s2.Values = '=PasteData!RsiRange'

  # Chart 2: Equity curve
  $left2 = $ws.Range('W22').Left
  $top2 = $ws.Range('W22').Top
  $right2 = $ws.Range('AF22').Left + $ws.Range('AF22').Width
  $bottom2 = $ws.Range('W40').Top + $ws.Range('W40').Height
  $ch2Obj = $ws.ChartObjects().Add($left2, $top2, ($right2-$left2), ($bottom2-$top2))
  $ch2 = $ch2Obj.Chart
  $ch2.ChartType = 4
  $ch2.HasTitle = $true
  $ch2.ChartTitle.Text = 'Equity Curve'
  $s3 = $ch2.SeriesCollection().NewSeries()
  $s3.Name = '="Equity"'
  $s3.XValues = '=PasteData!TsRange'
  $s3.Values = '=PasteData!EquityRange'

  $ws.Range('A1:V1').AutoFilter() | Out-Null
  $excel.ActiveWindow.SplitRow = 1
  $excel.ActiveWindow.FreezePanes = $true

  # Widths
  $ws.Columns.Item('A').ColumnWidth = 21
  $ws.Columns.Item('B').ColumnWidth = 11
  $ws.Columns.Item('C').ColumnWidth = 11
  $ws.Columns.Item('D').ColumnWidth = 11
  $ws.Columns.Item('E').ColumnWidth = 11
  $ws.Columns.Item('F').ColumnWidth = 9
  $ws.Columns.Item('G').ColumnWidth = 9
  $ws.Columns.Item('H').ColumnWidth = 9
  $ws.Columns.Item('I').ColumnWidth = 10
  $ws.Columns.Item('J').ColumnWidth = 10
  $ws.Columns.Item('K').ColumnWidth = 8
  $ws.Columns.Item('L').ColumnWidth = 11
  $ws.Columns.Item('M').ColumnWidth = 12
  $ws.Columns.Item('N').ColumnWidth = 10
  $ws.Columns.Item('O').ColumnWidth = 8
  $ws.Columns.Item('P').ColumnWidth = 10
  $ws.Columns.Item('Q').ColumnWidth = 10
  $ws.Columns.Item('R').ColumnWidth = 10
  $ws.Columns.Item('S').ColumnWidth = 8
  $ws.Columns.Item('T').ColumnWidth = 10
  $ws.Columns.Item('U').ColumnWidth = 10
  $ws.Columns.Item('V').ColumnWidth = 10
  $ws.Columns.Item('N').ColumnWidth = 12
  $ws.Columns.Item('O').ColumnWidth = 12

  $wb.SaveAs($outFile, 51)
  $wb.Close($true)
  Write-Output "Created: $outFile"
}
finally {
  $excel.Quit()
  if ($ws -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) }
  if ($wb -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
