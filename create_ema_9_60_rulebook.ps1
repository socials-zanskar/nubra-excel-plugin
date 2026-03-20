$ErrorActionPreference='Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$outFile = Join-Path $desktop 'EMA_9_60_Rulebook_Backtest.xlsx'
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

  # Columns
  $headers = @(
    'ts_ist','close','open','high','low',
    'EMA9','EMA60',
    'EntrySignalRaw','ExitSignalRaw','ActionExec',
    'Position','EntryPrice','StopPrice','ExitPrice',
    'GrossPnL','Cost','NetPnL','CumPnL','Equity'
  )
  for($i=0; $i -lt $headers.Count; $i++) { $ws.Cells.Item(1,$i+1).Value2 = $headers[$i] }

  # Parameter block W:X
  $ws.Cells.Item(1,23).Value2 = 'Fast EMA Period'
  $ws.Cells.Item(2,23).Value2 = 'Slow EMA Period'
  $ws.Cells.Item(3,23).Value2 = 'Fast Alpha'
  $ws.Cells.Item(4,23).Value2 = 'Slow Alpha'
  $ws.Cells.Item(5,23).Value2 = 'Cost % per side'
  $ws.Cells.Item(6,23).Value2 = 'Use Close Confirmation (1/0)'
  $ws.Cells.Item(7,23).Value2 = 'Use Stop Loss (1/0)'
  $ws.Cells.Item(8,23).Value2 = 'Stop Loss %'
  $ws.Cells.Item(9,23).Value2 = 'Start Equity'
  $ws.Cells.Item(10,23).Value2 = 'Allow Initial Trend Entry (1/0)'
  $ws.Cells.Item(11,23).Value2 = 'Data Order Check'

  $ws.Cells.Item(1,24).Value2 = 9
  $ws.Cells.Item(2,24).Value2 = 60
  $ws.Range('X3').Formula = '=2/(X1+1)'
  $ws.Range('X4').Formula = '=2/(X2+1)'
  $ws.Cells.Item(5,24).Value2 = 0.001
  $ws.Cells.Item(6,24).Value2 = 0
  $ws.Cells.Item(7,24).Value2 = 1
  $ws.Cells.Item(8,24).Value2 = 0.015
  $ws.Cells.Item(9,24).Value2 = 100000
  $ws.Cells.Item(10,24).Value2 = 1
  $ws.Range('X11').Formula = '=IF(OR(A2="",A3=""),"PASTE DATA",IF(A3>A2,"OK (OLDEST TO NEWEST)","SORT ASC BY ts_ist"))'

  # Seed row 2
  $ws.Range('F2').Formula = '=IF(B2="","",B2)'
  $ws.Range('G2').Formula = '=IF(B2="","",B2)'
  $ws.Range('H2').Formula = '=""'
  $ws.Range('I2').Formula = '=""'
  $ws.Range('J2').Formula = '=""'
  $ws.Range('K2').Formula = '=0'
  $ws.Range('L2').Formula = '=""'
  $ws.Range('M2').Formula = '=""'
  $ws.Range('N2').Formula = '=""'
  $ws.Range('O2').Formula = '=0'
  $ws.Range('P2').Formula = '=0'
  $ws.Range('Q2').Formula = '=0'
  $ws.Range('R2').Formula = '=0'
  $ws.Range('S2').Formula = '=$X$9+R2'

  # Main formulas row 3
  $ws.Range('F3').Formula = '=IF(B3="","",$X$3*B3+(1-$X$3)*F2)'
  $ws.Range('G3').Formula = '=IF(B3="","",$X$4*B3+(1-$X$4)*G2)'

  # Entry signal: only when flat; optional close confirmation
  $ws.Range('H3').Formula = '=IF(B3="","",IF(K2<>0,"",IF(AND(F2<=G2,F3>G3,IF($X$6=1,AND(B3>F3,B3>G3),TRUE)),"BUY_SIG",IF(AND(F2>=G2,F3<G3,IF($X$6=1,AND(B3<F3,B3<G3),TRUE)),"SELL_SIG",IF(AND($X$10=1,ROW()=3,F3>G3,IF($X$6=1,AND(B3>F3,B3>G3),TRUE)),"BUY_SIG",IF(AND($X$10=1,ROW()=3,F3<G3,IF($X$6=1,AND(B3<F3,B3<G3),TRUE)),"SELL_SIG",""))))))'

  # Exit signal: opposite crossover; optional SL from entry price
  $ws.Range('I3').Formula = '=IF(B3="","",IF(K2=1,IF($X$7=1,IF(B3<=L2*(1-$X$8),"EXIT_LONG_SL",IF(AND(F2>=G2,F3<G3),"EXIT_LONG_X","")),IF(AND(F2>=G2,F3<G3),"EXIT_LONG_X","")),IF(K2=-1,IF($X$7=1,IF(B3>=L2*(1+$X$8),"EXIT_SHORT_SL",IF(AND(F2<=G2,F3>G3),"EXIT_SHORT_X","")),IF(AND(F2<=G2,F3>G3),"EXIT_SHORT_X","")),"")))'

  # Execute previous-bar signal at current open
  $ws.Range('J3').Formula = '=IF(B3="","",IF(AND(K2=1,LEFT(I2,9)="EXIT_LONG"),"EXIT_LONG",IF(AND(K2=-1,LEFT(I2,10)="EXIT_SHORT"),"EXIT_SHORT",IF(H2="BUY_SIG","BUY",IF(H2="SELL_SIG","SELL","")))))'

  # Position state
  $ws.Range('K3').Formula = '=IF(B3="","",IF(J3="BUY",1,IF(J3="SELL",-1,IF(OR(J3="EXIT_LONG",J3="EXIT_SHORT"),0,K2))))'

  # Entry, stop, exit prices
  $ws.Range('L3').Formula = '=IF(B3="","",IF(OR(J3="BUY",J3="SELL"),C3,IF(K3<>0,L2,"")))'
  $ws.Range('M3').Formula = '=IF(B3="","",IF(K3=1,L3*(1-$X$8),IF(K3=-1,L3*(1+$X$8),"")))'
  $ws.Range('N3').Formula = '=IF(B3="","",IF(OR(J3="EXIT_LONG",J3="EXIT_SHORT"),C3,""))'

  # PnL and costs
  $ws.Range('O3').Formula = '=IF(B3="","",IF(AND(J3="EXIT_LONG",ISNUMBER(L2)),C3-L2,IF(AND(J3="EXIT_SHORT",ISNUMBER(L2)),L2-C3,0)))'
  $ws.Range('P3').Formula = '=IF(B3="","",IF(OR(J3="BUY",J3="SELL",J3="EXIT_LONG",J3="EXIT_SHORT"),C3*$X$5,0))'
  $ws.Range('Q3').Formula = '=IF(B3="","",IF(OR(J3="BUY",J3="SELL"),-P3,IF(OR(J3="EXIT_LONG",J3="EXIT_SHORT"),IFERROR(O3,0)-P3,0)))'
  $ws.Range('R3').Formula = '=IF(B3="","",R2+Q3)'
  $ws.Range('S3').Formula = '=IF(B3="","",$X$9+R3)'

  $maxRow = 20000
  $ws.Range('F3:S3').AutoFill($ws.Range("F3:S$maxRow"))

  # Formatting
  $ws.Range('A1:S1').Font.Bold = $true
  $ws.Range('A1:S1').Interior.Color = 0xD9E1F2
  $ws.Range('W1:W11').Font.Bold = $true
  $ws.Range('W1:X11').Borders.LineStyle = 1

  $ws.Range('X5').NumberFormat = '0.0000%'
  $ws.Range('X8').NumberFormat = '0.00%'
  $ws.Range('X9').NumberFormat = '#,##0.00'

  $ws.Range("A2:A$maxRow").NumberFormat = 'dd/mm/yyyy, hh:mm:ss'
  $ws.Range("B2:E$maxRow").NumberFormat = '#,##0.00'
  $ws.Range("F2:G$maxRow").NumberFormat = '#,##0.0000'
  $ws.Range("L2:S$maxRow").NumberFormat = '#,##0.00'

  # Conditional formatting
  $entryRange = $ws.Range("H2:H$maxRow")
  $fcBuySig = $entryRange.FormatConditions.Add(1,3,'="BUY_SIG"')
  $fcBuySig.Font.Color = 0x006100
  $fcBuySig.Interior.Color = 0xC6EFCE
  $fcSellSig = $entryRange.FormatConditions.Add(1,3,'="SELL_SIG"')
  $fcSellSig.Font.Color = 0x9C0006
  $fcSellSig.Interior.Color = 0xFFC7CE

  $actionRange = $ws.Range("J2:J$maxRow")
  $fcBuy = $actionRange.FormatConditions.Add(1,3,'="BUY"')
  $fcBuy.Font.Color = 0x006100
  $fcBuy.Interior.Color = 0xC6EFCE
  $fcSell = $actionRange.FormatConditions.Add(1,3,'="SELL"')
  $fcSell.Font.Color = 0x9C0006
  $fcSell.Interior.Color = 0xFFC7CE

  # Dynamic named ranges
  $null = $wb.Names.Add('DataRows','=MAX(1,COUNTA(PasteData!$B:$B)-1)')
  $null = $wb.Names.Add('TsRange','=OFFSET(PasteData!$A$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('CloseRange','=OFFSET(PasteData!$B$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('Ema9Range','=OFFSET(PasteData!$F$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('Ema60Range','=OFFSET(PasteData!$G$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('CumPnlRange','=OFFSET(PasteData!$R$2,0,0,DataRows,1)')

  # Chart 1: Price + EMAs
  $left1 = $ws.Range('Z2').Left
  $top1 = $ws.Range('Z2').Top
  $right1 = $ws.Range('AI2').Left + $ws.Range('AI2').Width
  $bottom1 = $ws.Range('Z20').Top + $ws.Range('Z20').Height
  $ch1Obj = $ws.ChartObjects().Add($left1, $top1, ($right1-$left1), ($bottom1-$top1))
  $ch1 = $ch1Obj.Chart
  $ch1.ChartType = 4
  $ch1.HasTitle = $true
  $ch1.ChartTitle.Text = 'Close with EMA 9 and EMA 60'

  $s1 = $ch1.SeriesCollection().NewSeries()
  $s1.Name = '="Close"'
  $s1.XValues = '=PasteData!TsRange'
  $s1.Values = '=PasteData!CloseRange'

  $s2 = $ch1.SeriesCollection().NewSeries()
  $s2.Name = '="EMA 9"'
  $s2.XValues = '=PasteData!TsRange'
  $s2.Values = '=PasteData!Ema9Range'

  $s3 = $ch1.SeriesCollection().NewSeries()
  $s3.Name = '="EMA 60"'
  $s3.XValues = '=PasteData!TsRange'
  $s3.Values = '=PasteData!Ema60Range'

  # Chart 2: Cum PnL starts at 0
  $left2 = $ws.Range('Z22').Left
  $top2 = $ws.Range('Z22').Top
  $right2 = $ws.Range('AI22').Left + $ws.Range('AI22').Width
  $bottom2 = $ws.Range('Z40').Top + $ws.Range('Z40').Height
  $ch2Obj = $ws.ChartObjects().Add($left2, $top2, ($right2-$left2), ($bottom2-$top2))
  $ch2 = $ch2Obj.Chart
  $ch2.ChartType = 4
  $ch2.HasTitle = $true
  $ch2.ChartTitle.Text = 'Cumulative PnL (Starts at 0)'

  $s4 = $ch2.SeriesCollection().NewSeries()
  $s4.Name = '="CumPnL"'
  $s4.XValues = '=PasteData!TsRange'
  $s4.Values = '=PasteData!CumPnlRange'

  $ws.Range('A1:S1').AutoFilter() | Out-Null
  $excel.ActiveWindow.SplitRow = 1
  $excel.ActiveWindow.FreezePanes = $true

  # Column widths
  $ws.Columns.Item('A').ColumnWidth = 21
  $ws.Columns.Item('B').ColumnWidth = 11
  $ws.Columns.Item('C').ColumnWidth = 11
  $ws.Columns.Item('D').ColumnWidth = 11
  $ws.Columns.Item('E').ColumnWidth = 11
  $ws.Columns.Item('F').ColumnWidth = 11
  $ws.Columns.Item('G').ColumnWidth = 11
  $ws.Columns.Item('H').ColumnWidth = 13
  $ws.Columns.Item('I').ColumnWidth = 13
  $ws.Columns.Item('J').ColumnWidth = 12
  $ws.Columns.Item('K').ColumnWidth = 8
  $ws.Columns.Item('L').ColumnWidth = 10
  $ws.Columns.Item('M').ColumnWidth = 10
  $ws.Columns.Item('N').ColumnWidth = 10
  $ws.Columns.Item('O').ColumnWidth = 10
  $ws.Columns.Item('P').ColumnWidth = 8
  $ws.Columns.Item('Q').ColumnWidth = 10
  $ws.Columns.Item('R').ColumnWidth = 10
  $ws.Columns.Item('S').ColumnWidth = 10
  $ws.Columns.Item('W').ColumnWidth = 28
  $ws.Columns.Item('X').ColumnWidth = 14

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
