Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "IconWriter.ps1")

$Accent = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
$AccentDark = [System.Drawing.Color]::FromArgb(255, 29, 78, 216)
$TableHeader = [System.Drawing.Color]::FromArgb(255, 90, 90, 140)
$TableBorder = [System.Drawing.Color]::FromArgb(255, 71, 85, 105)

function New-AppIconDetailed([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $s = $size / 256.0

    $bgRect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect, $AccentDark, $Accent, 45.0)
    $g.FillRectangle($bgBrush, $bgRect)
    $bgBrush.Dispose()

    if ($size -ge 32) {
        $gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(38, 255, 255, 255)), 1
        $step = [Math]::Max(4, [int](18 * $s))
        for ($x = 0; $x -le $size; $x += $step) { $g.DrawLine($gridPen, $x, 0, $x, $size) }
        for ($y = 0; $y -le $size; $y += $step) { $g.DrawLine($gridPen, 0, $y, $size, $y) }
        $gridPen.Dispose()
    }

    $t1 = New-Object System.Drawing.RectangleF (34*$s), (54*$s), (96*$s), (68*$s)
    $t2 = New-Object System.Drawing.RectangleF (142*$s), (44*$s), (82*$s), (62*$s)
    $t3 = New-Object System.Drawing.RectangleF (108*$s), (154*$s), (88*$s), (66*$s)

    Draw-DbTable $g $t1 $TableHeader $TableBorder $s 3
    Draw-DbTable $g $t2 ([System.Drawing.Color]::FromArgb(255, 52, 101, 164)) $TableBorder $s 2
    Draw-DbTable $g $t3 ([System.Drawing.Color]::FromArgb(255, 0, 114, 66)) $TableBorder $s 2

    if ($size -ge 32) {
        $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 255, 255, 255)), ([Math]::Max(1.5, 2.8*$s))
        $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $p1 = New-Object System.Drawing.PointF $t1.Right, ($t1.Y + 18*$s)
        $p2 = New-Object System.Drawing.PointF $t2.X, ($t2.Y + 16*$s)
        $p3 = New-Object System.Drawing.PointF ($t2.X + $t2.Width/2), $t2.Bottom
        $p4 = New-Object System.Drawing.PointF ($t3.X + $t3.Width/2), $t3.Y
        $g.DrawLine($linePen, $p1, $p2)
        $g.DrawLine($linePen, $p3, $p4)
        $linePen.Dispose()
    }

    $g.Dispose()
    return $bmp
}

function New-AppIconSimple([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $g.Clear($Accent)

    $pad = [Math]::Max(1, [int]($size * 0.12))
    $w = $size - $pad * 2
    $h = [int]($w * 0.55)
    $x = $pad
    $y1 = $pad + [int]($h * 0.05)
    $y2 = $size - $pad - $h

    $t1 = New-Object System.Drawing.RectangleF $x, $y1, ($w * 0.58), $h
    $t2 = New-Object System.Drawing.RectangleF ($x + $w * 0.42), $y2, ($w * 0.58), $h
    Draw-DbTable $g $t1 $TableHeader $TableBorder ($size / 32.0) 2
    Draw-DbTable $g $t2 ([System.Drawing.Color]::FromArgb(255, 52, 101, 164)) $TableBorder ($size / 32.0) 2

    if ($size -ge 16) {
        $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.0, $size / 10.0))
        $g.DrawLine($linePen, $t1.Right, ($t1.Y + $t1.Height/2), $t2.X, ($t2.Y + $t2.Height/2))
        $linePen.Dispose()
    }

    $g.Dispose()
    return $bmp
}

function New-AppIconBitmap([int]$size) {
    if ($size -le 24) { return New-AppIconSimple $size }
    if ($size -eq 256) { return New-AppIconDetailed 256 }
    $detailed = New-AppIconDetailed 256
    try { return Scale-Bitmap $detailed $size }
    finally { $detailed.Dispose() }
}

$assetsDir = Join-Path $PSScriptRoot "..\Assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
$outPath = Join-Path $assetsDir "AppIcon.ico"
Save-MultiSizeIcon -Path $outPath -Sizes @(16, 24, 32, 48, 64, 128, 256) -DrawBitmap ${function:New-AppIconBitmap}
Write-Host "Created $outPath"
