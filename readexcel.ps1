param(
    [string]$ExcelPath = "$pwd\Archaeological Sites.xlsx",
    [string]$JsonPath = "$pwd\sites.json"
)

function ConvertTo-JSONArray {
    param([object[,]]$range2d)
    if (-not $range2d) { return @() }
    $rows = $range2d.GetLength(0)
    $cols = $range2d.GetLength(1)
    if ($rows -eq 0) { return @() }
    # First row is headers
    $headers = 1..$cols | ForEach-Object { $range2d[1, $_] }
    $data = @()
    for ($r = 2; $r -le $rows; $r++) {
        $item = @{}
        for ($c = 1; $c -le $cols; $c++) {
            $value = $range2d[$r, $c]
            if ($value -is [double] -and [math]::Truncate($value) -eq $value) {
                $value = [int]$value
            }
            $item[$headers[$c-1]] = $value
        }
        $data += $item
    }
    return $data
}

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($ExcelPath)
    $worksheet = $workbook.Worksheets.Item(1)
    $usedRange = $worksheet.UsedRange
    $value = $usedRange.Value2
    $jsonArray = ConvertTo-JSONArray $value
    $json = $jsonArray | ConvertTo-Json -Depth 10
    $json | Out-File -FilePath $JsonPath -Encoding UTF8
    Write-Host "Successfully converted to $JsonPath"
} catch {
    Write-Error "Failed to convert Excel to JSON: $_"
} finally {
    if ($workbook) { $workbook.Close() | Out-Null }
    if ($excel) { $excel.Quit() | Out-Null }
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($worksheet) | Out-Null
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
