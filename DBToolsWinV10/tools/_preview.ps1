Add-Type -AssemblyName System.Drawing
$ico  = 'd:\Home\Projects\TestSimulator\DBToolsWinV10\Assets\AppIcon.ico'
$out  = 'd:\Home\Projects\TestSimulator\DBToolsWinV10\Assets\_preview_AppIcon.png'
$bytes = [System.IO.File]::ReadAllBytes($ico)
$count = [System.BitConverter]::ToUInt16($bytes, 4)
# pick the 256x256 entry (last one)
$last = $count - 1
$size = [System.BitConverter]::ToUInt32($bytes, 6 + $last*16 + 8)
$off  = [System.BitConverter]::ToUInt32($bytes, 6 + $last*16 + 12)
$png  = $bytes[$off..($off + $size - 1)]
$ms   = New-Object System.IO.MemoryStream(,$png)
$src  = [System.Drawing.Bitmap]::FromStream($ms)
$dst  = New-Object System.Drawing.Bitmap(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g    = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, 0, 0, 128, 128)
$g.Dispose()
$dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose(); $dst.Dispose(); $ms.Dispose()
Write-Host "Preview saved to $out"
