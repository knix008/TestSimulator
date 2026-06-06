Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$iconPath = Join-Path $PSScriptRoot "..\Assets\AppIcon.ico"
$resxPath = Join-Path $PSScriptRoot "..\MainForm.resx"

$icon = [System.Drawing.Icon]::new($iconPath)
$converter = [System.ComponentModel.TypeDescriptor]::GetConverter([System.Drawing.Icon])
$bytes = $converter.ConvertTo($icon, [byte[]])
$b64 = [Convert]::ToBase64String($bytes)
$icon.Dispose()

$xml = @"
  <data name="`$this.Icon" type="System.Drawing.Icon, System.Drawing" mimetype="application/x-microsoft.net.object.bytearray.base64">
    <value>$b64</value>
  </data>
"@

$content = Get-Content $resxPath -Raw -Encoding UTF8
if ($content -match '<data name="\$this\.Icon"') {
    $content = [regex]::Replace($content, '(?s)<data name="\$this\.Icon".*?</data>\s*', '')
}
$content = $content -replace '</root>', ($xml + "`n</root>")
Set-Content -Path $resxPath -Value $content -Encoding UTF8
Write-Host "Embedded icon into MainForm.resx"
