Add-Type -AssemblyName System.Drawing

foreach ($p in @(
    (Join-Path $PSScriptRoot "..\Assets\AppIcon.ico"),
    (Join-Path $PSScriptRoot "..\Assets\FileIcon.ico"))) {
    $bytes = [IO.File]::ReadAllBytes($p)
    Write-Host "=== $p ($($bytes.Length) bytes) ==="
    $count = [BitConverter]::ToUInt16($bytes, 4)
    Write-Host "Image count: $count"
    for ($i = 0; $i -lt $count; $i++) {
        $o = 6 + 16 * $i
        $w = $bytes[$o]; $h = $bytes[$o + 1]
        $bpp = [BitConverter]::ToUInt16($bytes, $o + 10)
        $sz = [BitConverter]::ToUInt32($bytes, $o + 8)
        $dw = if ($w -eq 0) { 256 } else { $w }
        $dh = if ($h -eq 0) { 256 } else { $h }
        Write-Host "  [$i] ${dw}x${dh} bpp=$bpp pngBytes=$sz"
    }
    $icon = New-Object System.Drawing.Icon $p
    Write-Host "  Default icon size: $($icon.Width)x$($icon.Height)"
    $icon.Dispose()
}
