# 경로를 환경 변수로 전달받아 인수 파싱 문제를 회피
$PublishDir = $env:WIX_PUBLISH_DIR
$OutputFile = $env:WIX_OUTPUT_FILE

$files = Get-ChildItem $PublishDir.TrimEnd('\') -File | Sort-Object Name

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$sb.AppendLine('<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">')
[void]$sb.AppendLine('  <Fragment>')
[void]$sb.AppendLine('    <ComponentGroup Id="AppComponents" Directory="INSTALLFOLDER">')

foreach ($f in $files) {
    $id  = 'comp_' + ($f.Name -replace '[^a-zA-Z0-9]', '_')
    $src = $f.FullName
    [void]$sb.AppendLine("      <Component Id=`"$id`" Guid=`"*`"><File Source=`"$src`" KeyPath=`"yes`" /></Component>")
}

[void]$sb.AppendLine('    </ComponentGroup>')
[void]$sb.AppendLine('  </Fragment>')
[void]$sb.AppendLine('</Wix>')

[System.IO.File]::WriteAllText($OutputFile, $sb.ToString(), [System.Text.Encoding]::UTF8)
Write-Host "Generated: $OutputFile  ($($files.Count) files)"
