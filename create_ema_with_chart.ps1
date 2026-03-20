$ErrorActionPreference='Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$outFile = Join-Path $desktop 'EMA_Crossover_Template_WithChart.xlsx'
if (Test-Path $outFile) { Remove-Item $outFile -Force }

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $null
$ws = $null
$chartObj = $null
$chart = $null
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $ws.Name = 'PasteData'

  $headers = @(
    'ts_ist','close','open','high','low','volume',
    'EMA Fast','EMA Slow','Diff','Signal','Trade','Signal PnL',
    'Position','Entry Price','Stop Loss','Target (1:2)','Exit','Realized PnL','Cum PnL'
  )
  for($i=0; $i -lt $headers.Count; $i++) { $ws.Cells.Item(1, $i+1).Value2 = $headers[$i] }

  # Parameters kept on right side
  $ws.Cells.Item(1,21).Value2 = 'Fast Period'
  $ws.Cells.Item(2,21).Value2 = 'Slow Period'
  $ws.Cells.Item(3,21).Value2 = 'Fast Alpha'
  $ws.Cells.Item(4,21).Value2 = 'Slow Alpha'
  $ws.Cells.Item(5,21).Value2 = 'RR Multiple'
  $ws.Cells.Item(6,21).Value2 = 'Total Realized PnL'
  $ws.Cells.Item(1,22).Value2 = 9
  $ws.Cells.Item(2,22).Value2 = 21
  $ws.Range('V3').Formula = '=2/(V1+1)'
  $ws.Range('V4').Formula = '=2/(V2+1)'
  $ws.Cells.Item(5,22).Value2 = 2

  # EMA and signal formulas
  $ws.Range('G2').Formula = '=IF(B2="","",B2)'
  $ws.Range('H2').Formula = '=IF(B2="","",B2)'
  $ws.Range('I2').Formula = '=IF(B2="","",G2-H2)'
  $ws.Range('J2').Formula = '=""'
  $ws.Range('K2').Formula = '=""'
  $ws.Range('L2').Formula = '=IF(OR(B2="",K2=""),"",K2*B2)'
  $ws.Range('M2').Formula = '=0'
  $ws.Range('N2').Formula = '=""'
  $ws.Range('O2').Formula = '=""'
  $ws.Range('P2').Formula = '=""'
  $ws.Range('Q2').Formula = '=""'
  $ws.Range('R2').Formula = '=0'
  $ws.Range('S2').Formula = '=0'

  $ws.Range('G3').Formula = '=IF(B3="","",$V$3*B3+(1-$V$3)*G2)'
  $ws.Range('H3').Formula = '=IF(B3="","",$V$4*B3+(1-$V$4)*H2)'
  $ws.Range('I3').Formula = '=IF(B3="","",G3-H3)'
  $ws.Range('J3').Formula = '=IF(B3="","",IF(AND(G2<=H2,G3>H3),"BUY",IF(AND(G2>=H2,G3<H3),"SELL","")))'
  $ws.Range('K3').Formula = '=IF(J3="BUY",1,IF(J3="SELL",-1,0))'
  $ws.Range('L3').Formula = '=IF(OR(B3="",K3=""),"",K3*B3)'
  $ws.Range('M3').Formula = '=IF(B3="","",IF(M2=0,IF(K3<>0,K3,0),IF(Q3<>"",0,M2)))'
  $ws.Range('N3').Formula = '=IF(B3="","",IF(M2=0,IF(K3<>0,B3,""),IF(Q3<>"","",N2)))'
  $ws.Range('O3').Formula = '=IF(B3="","",IF(M2=0,IF(K3=1,E3,IF(K3=-1,D3,"")),IF(Q3<>"","",O2)))'
  $ws.Range('P3').Formula = '=IF(B3="","",IF(M2=0,IF(K3=1,B3+$V$5*(B3-E3),IF(K3=-1,B3-$V$5*(D3-B3),"")),IF(Q3<>"","",P2)))'
  $ws.Range('Q3').Formula = '=IF(B3="","",IF(M2=1,IF(E3<=O2,"SL",IF(D3>=P2,"TP","")),IF(M2=-1,IF(D3>=O2,"SL",IF(E3<=P2,"TP","")),"")))'
  $ws.Range('R3').Formula = '=IF(B3="","",IF(Q3="TP",IF(M2=1,P2-N2,N2-P2),IF(Q3="SL",IF(M2=1,O2-N2,N2-O2),0)))'
  $ws.Range('S3').Formula = '=IF(B3="","",S2+R3)'

  $maxRow = 20000
  $ws.Range('G3:S3').AutoFill($ws.Range("G3:S$maxRow"))

  # Styling
  $ws.Range('A1:S1').Font.Bold = $true
  $ws.Range('A1:S1').Interior.Color = 0xD9E1F2
  $ws.Range('U1:U6').Font.Bold = $true
  $ws.Range('U1:V6').Borders.LineStyle = 1
  $ws.Range('V3:V4').NumberFormat = '0.000000'
  $ws.Range('V6').Formula = '=SUM(R2:INDEX(R:R,DataRows+1))'
  $ws.Range('V6').NumberFormat = '#,##0.00'

  $ws.Range("A2:A$maxRow").NumberFormat = 'dd/mm/yyyy, hh:mm:ss'
  $ws.Range("B2:E$maxRow").NumberFormat = '#,##0.00'
  $ws.Range("F2:F$maxRow").NumberFormat = '#,##0'
  $ws.Range("G2:I$maxRow").NumberFormat = '#,##0.0000'
  $ws.Range("L2:L$maxRow").NumberFormat = '#,##0.00'
  $ws.Range("N2:P$maxRow").NumberFormat = '#,##0.00'
  $ws.Range("R2:S$maxRow").NumberFormat = '#,##0.00'

  $signalRange = $ws.Range("J2:J$maxRow")
  $fcBuy = $signalRange.FormatConditions.Add(1, 3, '="BUY"')
  $fcBuy.Font.Color = 0x006100
  $fcBuy.Interior.Color = 0xC6EFCE
  $fcSell = $signalRange.FormatConditions.Add(1, 3, '="SELL"')
  $fcSell.Font.Color = 0x9C0006
  $fcSell.Interior.Color = 0xFFC7CE
  $exitRange = $ws.Range("Q2:Q$maxRow")
  $fcTp = $exitRange.FormatConditions.Add(1, 3, '="TP"')
  $fcTp.Font.Color = 0x006100
  $fcTp.Interior.Color = 0xC6EFCE
  $fcSl = $exitRange.FormatConditions.Add(1, 3, '="SL"')
  $fcSl.Font.Color = 0x9C0006
  $fcSl.Interior.Color = 0xFFC7CE

  # Dynamic named ranges for chart
  $null = $wb.Names.Add('DataRows','=MAX(1,COUNTA(PasteData!$B:$B)-1)')
  $null = $wb.Names.Add('TsRange','=OFFSET(PasteData!$A$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('CloseRange','=OFFSET(PasteData!$B$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('EmaFastRange','=OFFSET(PasteData!$G$2,0,0,DataRows,1)')
  $null = $wb.Names.Add('EmaSlowRange','=OFFSET(PasteData!$H$2,0,0,DataRows,1)')

  # Place chart in free area on the far right (W6:AH26)
  $left = $ws.Range('W6').Left
  $top = $ws.Range('W6').Top
  $right = $ws.Range('AH6').Left + $ws.Range('AH6').Width
  $bottom = $ws.Range('W26').Top + $ws.Range('W26').Height
  $width = $right - $left
  $height = $bottom - $top

  $chartObj = $ws.ChartObjects().Add($left, $top, $width, $height)
  $chartObj.Placement = 1
  $chart = $chartObj.Chart
  $chart.ChartType = 4
  $chart.HasTitle = $true
  $chart.ChartTitle.Text = 'EMA Crossover (Close vs EMA Fast/EMA Slow)'

  $s1 = $chart.SeriesCollection().NewSeries()
  $s1.Name = '="Close"'
  $s1.XValues = '=PasteData!TsRange'
  $s1.Values = '=PasteData!CloseRange'

  $s2 = $chart.SeriesCollection().NewSeries()
  $s2.Name = '="EMA Fast"'
  $s2.XValues = '=PasteData!TsRange'
  $s2.Values = '=PasteData!EmaFastRange'

  $s3 = $chart.SeriesCollection().NewSeries()
  $s3.Name = '="EMA Slow"'
  $s3.XValues = '=PasteData!TsRange'
  $s3.Values = '=PasteData!EmaSlowRange'

  $chart.HasLegend = $true

  $ws.Range('A1:S1').AutoFilter() | Out-Null
  $excel.ActiveWindow.SplitRow = 1
  $excel.ActiveWindow.FreezePanes = $true

  $ws.Columns.Item('A').ColumnWidth = 22
  $ws.Columns.Item('B').ColumnWidth = 12
  $ws.Columns.Item('C').ColumnWidth = 12
  $ws.Columns.Item('D').ColumnWidth = 12
  $ws.Columns.Item('E').ColumnWidth = 12
  $ws.Columns.Item('F').ColumnWidth = 12
  $ws.Columns.Item('G').ColumnWidth = 12
  $ws.Columns.Item('H').ColumnWidth = 12
  $ws.Columns.Item('I').ColumnWidth = 12
  $ws.Columns.Item('J').ColumnWidth = 10
  $ws.Columns.Item('K').ColumnWidth = 8
  $ws.Columns.Item('L').ColumnWidth = 12
  $ws.Columns.Item('M').ColumnWidth = 9
  $ws.Columns.Item('N').ColumnWidth = 11
  $ws.Columns.Item('O').ColumnWidth = 11
  $ws.Columns.Item('P').ColumnWidth = 11
  $ws.Columns.Item('Q').ColumnWidth = 8
  $ws.Columns.Item('R').ColumnWidth = 12
  $ws.Columns.Item('S').ColumnWidth = 12
  $ws.Columns.Item('U').ColumnWidth = 19
  $ws.Columns.Item('V').ColumnWidth = 14

  $wb.SaveAs($outFile, 51)
  $wb.Close($true)
  Write-Output "Created: $outFile"
}
finally {
  $excel.Quit()
  if ($chart -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($chart) }
  if ($chartObj -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($chartObj) }
  if ($ws -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) }
  if ($wb -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
