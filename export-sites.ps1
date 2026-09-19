[CmdletBinding()]
param(
    [string]$WorkbookPath = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'Archaeological Sites.xlsx'),
    [string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'data')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CellText {
    param([object]$Cell)

    $value = $Cell.Value2
    if ($null -eq $value) {
        return $null
    }

    $text = ([string]$value) -replace '\s+', ' '
    $text = $text.Trim()
    if ($text.Length) {
        return $text
    }

    return $null
}

if (-not (Test-Path -LiteralPath $WorkbookPath -PathType Leaf)) {
    throw "Workbook not found: $WorkbookPath"
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$excel = $null
$workbook = $null
$worksheet = $null

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open((Resolve-Path -LiteralPath $WorkbookPath).Path, $null, $true)
    $worksheet = $workbook.Worksheets.Item('sites')
    $usedRange = $worksheet.UsedRange

    $headers = @{}
    for ($column = 1; $column -le $usedRange.Columns.Count; $column++) {
        $header = Get-CellText $worksheet.Cells.Item($usedRange.Row, $usedRange.Column + $column - 1)
        if ($header) {
            $headers[$header] = $usedRange.Column + $column - 1
        }
    }

    $requiredHeaders = 'Site', 'Y', 'X', 'Type', 'Investigator', 'Date / Year', 'Reference1', 'References2'
    $missingHeaders = $requiredHeaders | Where-Object { -not $headers.ContainsKey($_) }
    if ($missingHeaders) {
        throw "Missing expected worksheet columns: $($missingHeaders -join ', ')"
    }

    $sites = [System.Collections.Generic.List[object]]::new()
    $invariant = [System.Globalization.CultureInfo]::InvariantCulture

    for ($row = $usedRange.Row + 1; $row -le ($usedRange.Row + $usedRange.Rows.Count - 1); $row++) {
        $siteName = Get-CellText $worksheet.Cells.Item($row, $headers['Site'])
        $latitudeText = Get-CellText $worksheet.Cells.Item($row, $headers['Y'])
        $longitudeText = Get-CellText $worksheet.Cells.Item($row, $headers['X'])
        $latitude = 0.0
        $longitude = 0.0

        if (-not [double]::TryParse($latitudeText, [System.Globalization.NumberStyles]::Float, $invariant, [ref]$latitude) -or
            -not [double]::TryParse($longitudeText, [System.Globalization.NumberStyles]::Float, $invariant, [ref]$longitude)) {
            Write-Warning "Skipping row $row because it does not have valid numeric coordinates."
            continue
        }

        $sites.Add([ordered]@{
            id           = $sites.Count + 1
            sourceRow    = $row
            site         = $siteName
            latitude     = [Math]::Round($latitude, 6)
            longitude    = [Math]::Round($longitude, 6)
            type         = Get-CellText $worksheet.Cells.Item($row, $headers['Type'])
            investigator = Get-CellText $worksheet.Cells.Item($row, $headers['Investigator'])
            dateYear     = Get-CellText $worksheet.Cells.Item($row, $headers['Date / Year'])
            reference1   = Get-CellText $worksheet.Cells.Item($row, $headers['Reference1'])
            reference2   = Get-CellText $worksheet.Cells.Item($row, $headers['References2'])
        })
    }

    $sites = @($sites | Sort-Object site, id)
    $types = @($sites | Where-Object type | ForEach-Object type | Sort-Object -Unique)
    $investigators = @($sites | Where-Object investigator | ForEach-Object investigator | Sort-Object -Unique)
    $dates = @($sites | Where-Object dateYear | ForEach-Object dateYear | Sort-Object -Unique)

    $payload = [ordered]@{
        metadata = [ordered]@{
            title             = 'Vidarbha Archaeological Atlas'
            sourceWorkbook    = (Split-Path -Leaf $WorkbookPath)
            sourceSheet       = 'sites'
            generatedAt       = (Get-Date).ToUniversalTime().ToString('o')
            recordCount       = $sites.Count
            availableTypes    = $types.Count
            availableInvestigators = $investigators.Count
            availableDateYears = $dates.Count
        }
        sites = $sites
    }

    $json = $payload | ConvertTo-Json -Depth 6
    $jsonPath = Join-Path $OutputDirectory 'sites.json'
    $scriptPath = Join-Path $OutputDirectory 'sites.js'
    Set-Content -LiteralPath $jsonPath -Value $json -Encoding utf8
    Set-Content -LiteralPath $scriptPath -Value "window.ARCHAEOLOGICAL_ATLAS = $json;" -Encoding utf8

    Write-Host "Exported $($sites.Count) sites to: $jsonPath"
    Write-Host "Browser-ready data written to: $scriptPath"
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) {
        $excel.Quit()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
