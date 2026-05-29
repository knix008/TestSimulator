param(
    [string]$PublishDir,
    [string]$OutputFile
)

# Resolve any ".." in the path to get a canonical absolute path
$pub = [System.IO.Path]::GetFullPath($PublishDir)

if (-not (Test-Path $pub)) {
    Write-Error "Publish directory not found: $pub"
    exit 1
}

$files = Get-ChildItem -Path $pub -File -Recurse | Sort-Object FullName

$xml = [System.Text.StringBuilder]::new()
$null = $xml.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
$null = $xml.AppendLine('<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">')
$null = $xml.AppendLine('  <Fragment>')
$null = $xml.AppendLine('    <ComponentGroup Id="AppBinaries" Directory="INSTALLFOLDER">')

$idx = 0
foreach ($f in $files) {
    $rel = $f.FullName.Substring($pub.Length).TrimStart('\', '/')
    # Use index suffix to guarantee uniqueness regardless of filename
    $id = 'f{0:D3}_{1}' -f $idx, ($rel -replace '[^a-zA-Z0-9]', '_')
    $src = $f.FullName
    $null = $xml.AppendLine("      <Component Id=`"$id`" Guid=`"*`"><File Source=`"$src`" /></Component>")
    $idx++
}

$null = $xml.AppendLine('    </ComponentGroup>')
$null = $xml.AppendLine('  </Fragment>')
$null = $xml.AppendLine('</Wix>')

$outDir = [System.IO.Path]::GetDirectoryName($OutputFile)
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
[System.IO.File]::WriteAllText($OutputFile, $xml.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "Generated AppBinaries WXS with $($files.Count) files -> $OutputFile"
