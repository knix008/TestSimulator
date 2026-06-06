Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\Assets\icon-preview"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

foreach ($name in @("AppIcon", "FileIcon")) {
    $icoPath = Join-Path $PSScriptRoot "..\Assets\$name.ico"
    $bytes = [IO.File]::ReadAllBytes($icoPath)
    $count = [BitConverter]::ToUInt16($bytes, 4)
    for ($i = 0; $i -lt $count; $i++) {
        $o = 6 + 16 * $i
        $w = $bytes[$o]; $h = $bytes[$o + 1]
        $sz = [BitConverter]::ToUInt32($bytes, $o + 8)
        $offset = [BitConverter]::ToUInt32($bytes, $o + 12)
        $dw = if ($w -eq 0) { 256 } elseif ($w -eq 255) { 255 } else { $w }
        $dh = if ($h -eq 0) { 256 } elseif ($h -eq 255) { 255 } else { $h }
        $png = $bytes[$offset..($offset + $sz - 1)]
        $pngPath = Join-Path $outDir "$name-$dw.png"
        [IO.File]::WriteAllBytes($pngPath, $png)
        Write-Host "Wrote $pngPath ($sz bytes)"
    }
}
