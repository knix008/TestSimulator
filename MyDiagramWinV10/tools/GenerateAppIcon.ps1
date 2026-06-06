Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "IconWriter.ps1")

function New-AppIconDetailed([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $s = $size / 256.0

    $bgRect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.Color]::FromArgb(255, 29, 78, 216),
        [System.Drawing.Color]::FromArgb(255, 37, 99, 235),
        45.0)
    $g.FillRectangle($bgBrush, $bgRect)
    $bgBrush.Dispose()

    if ($size -ge 32) {
        $gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(38, 255, 255, 255)), 1
        $step = [Math]::Max(4, [int](18 * $s))
        for ($x = 0; $x -le $size; $x += $step) { $g.DrawLine($gridPen, $x, 0, $x, $size) }
        for ($y = 0; $y -le $size; $y += $step) { $g.DrawLine($gridPen, 0, $y, $size, $y) }
        $gridPen.Dispose()
    }

    $rect = New-Object System.Drawing.RectangleF (40*$s), (48*$s), (92*$s), (60*$s)
    $ellipse = New-Object System.Drawing.RectangleF (150*$s), (42*$s), (74*$s), (74*$s)
    $diamond = New-Object System.Drawing.RectangleF (122*$s), (152*$s), (78*$s), (78*$s)

    if ($size -ge 32) {
        $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(170, 255, 255, 255)), ([Math]::Max(1.5, 3.0*$s))
        $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $rectCenter = New-Object System.Drawing.PointF $rect.Right, ($rect.Y + $rect.Height/2)
        $ellipseCenter = New-Object System.Drawing.PointF $ellipse.X, ($ellipse.Y + $ellipse.Height/2)
        $diamondTop = New-Object System.Drawing.PointF ($diamond.X + $diamond.Width/2), $diamond.Y
        $g.DrawLine($linePen, $rectCenter, $ellipseCenter)
        $g.DrawLine($linePen, (New-Object System.Drawing.PointF ($ellipse.X + $ellipse.Width/2), $ellipse.Bottom), $diamondTop)
        $linePen.Dispose()
    }

    $fillBlue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 239, 246, 255))
    $borderBlue = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.5, 3.0*$s))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = [Math]::Max(2, 12*$s); $d = 2*$r
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right-$d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right-$d, $rect.Bottom-$d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom-$d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($fillBlue, $path); $g.DrawPath($borderBlue, $path)
    $path.Dispose(); $fillBlue.Dispose(); $borderBlue.Dispose()

    $fillGreen = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 220, 252, 231))
    $borderGreen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.5, 3.0*$s))
    $g.FillEllipse($fillGreen, $ellipse); $g.DrawEllipse($borderGreen, $ellipse)
    $fillGreen.Dispose(); $borderGreen.Dispose()

    $fillOrange = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 254, 243, 199))
    $borderOrange = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.5, 3.0*$s))
    $pts = @(
        (New-Object System.Drawing.PointF ($diamond.X + $diamond.Width/2), $diamond.Y),
        (New-Object System.Drawing.PointF $diamond.Right, ($diamond.Y + $diamond.Height/2)),
        (New-Object System.Drawing.PointF ($diamond.X + $diamond.Width/2), $diamond.Bottom),
        (New-Object System.Drawing.PointF $diamond.X, ($diamond.Y + $diamond.Height/2))
    )
    $g.FillPolygon($fillOrange, $pts); $g.DrawPolygon($borderOrange, $pts)
    $fillOrange.Dispose(); $borderOrange.Dispose()

    $g.Dispose()
    return $bmp
}

function New-AppIconSimple([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $pad = [Math]::Max(1, [int]($size * 0.06))
    $g.Clear([System.Drawing.Color]::FromArgb(255, 37, 99, 235))

    $cell = ($size - $pad * 2) / 3.0
    $y0 = $pad + $cell * 0.15
    $y1 = $pad + $cell * 1.05
    $x0 = $pad + $cell * 0.05
    $x1 = $pad + $cell * 1.05
    $x2 = $pad + $cell * 1.95

    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.2, $size / 10.0))
    $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 239, 246, 255))

    $r1 = New-Object System.Drawing.RectangleF $x0, $y0, ($cell * 0.95), ($cell * 0.72)
    $g.FillRectangle($fill, $r1); $g.DrawRectangle($pen, $r1.X, $r1.Y, $r1.Width, $r1.Height)

    $r2 = New-Object System.Drawing.RectangleF $x1, $y0, ($cell * 0.82), ($cell * 0.82)
    $g.FillEllipse($fill, $r2); $g.DrawEllipse($pen, $r2)

    $cx = $x2 + $cell * 0.41; $cy = $y1 + $cell * 0.45; $hs = $cell * 0.42
    $dPts = @(
        (New-Object System.Drawing.PointF $cx, ($cy - $hs)),
        (New-Object System.Drawing.PointF ($cx + $hs), $cy),
        (New-Object System.Drawing.PointF $cx, ($cy + $hs)),
        (New-Object System.Drawing.PointF ($cx - $hs), $cy)
    )
    $g.FillPolygon($fill, $dPts); $g.DrawPolygon($pen, $dPts)

    $pen.Dispose(); $fill.Dispose()
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
$installerAssetsDir = Join-Path $PSScriptRoot "..\installer\assets"
New-Item -ItemType Directory -Force -Path $assetsDir, $installerAssetsDir | Out-Null

$targets = @(
    (Join-Path $assetsDir "AppIcon.ico"),
    (Join-Path $installerAssetsDir "AppIcon.ico")
)

foreach ($outPath in $targets) {
    Save-MultiSizeIcon -Path $outPath -Sizes @(16, 24, 32, 48, 64, 128, 256) -DrawBitmap ${function:New-AppIconBitmap}
    Write-Host "Created $outPath"
}
