Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "IconWriter.ps1")

function New-SvgEditorIconDetailed([int]$size) {
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
        $gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(42, 255, 255, 255)), 1
        $step = [Math]::Max(4, [int](20 * $s))
        for ($x = 0; $x -le $size; $x += $step) { $g.DrawLine($gridPen, $x, 0, $x, $size) }
        for ($y = 0; $y -le $size; $y += $step) { $g.DrawLine($gridPen, 0, $y, $size, $y) }
        $gridPen.Dispose()
    }

    $rect = New-Object System.Drawing.RectangleF (36*$s), (52*$s), (88*$s), (58*$s)
    $ellipse = New-Object System.Drawing.RectangleF (142*$s), (46*$s), (78*$s), (78*$s)
    $diamond = New-Object System.Drawing.RectangleF (118*$s), (148*$s), (72*$s), (72*$s)

    $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 219, 234, 254))
    $stroke = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.5, 3.0*$s))
    $stroke.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = [Math]::Max(2, 10*$s); $d = 2*$r
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right-$d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right-$d, $rect.Bottom-$d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom-$d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($fill, $path)
    $g.DrawPath($stroke, $path)
    $path.Dispose()

    $g.FillEllipse($fill, $ellipse)
    $g.DrawEllipse($stroke, $ellipse)

    $dPts = @(
        (New-Object System.Drawing.PointF ($diamond.X + $diamond.Width/2), $diamond.Y),
        (New-Object System.Drawing.PointF $diamond.Right, ($diamond.Y + $diamond.Height/2)),
        (New-Object System.Drawing.PointF ($diamond.X + $diamond.Width/2), $diamond.Bottom),
        (New-Object System.Drawing.PointF $diamond.X, ($diamond.Y + $diamond.Height/2))
    )
    $g.FillPolygon($fill, $dPts)
    $g.DrawPolygon($stroke, $dPts)

    if ($size -ge 32) {
        $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 255, 255, 255)), ([Math]::Max(1.5, 2.8*$s))
        $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($linePen, (42*$s), (188*$s), (214*$s), (68*$s))
        $linePen.Dispose()

        $tagPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(190, 255, 255, 255)), ([Math]::Max(1.2, 2.4*$s))
        $tagPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $tagPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($tagPen, (58*$s), (34*$s), (48*$s), (44*$s))
        $g.DrawLine($tagPen, (48*$s), (44*$s), (48*$s), (58*$s))
        $g.DrawLine($tagPen, (198*$s), (222*$s), (208*$s), (212*$s))
        $g.DrawLine($tagPen, (208*$s), (212*$s), (208*$s), (198*$s))
        $tagPen.Dispose()
    }

    $fill.Dispose()
    $stroke.Dispose()
    $g.Dispose()
    return $bmp
}

function New-SvgEditorIconSimple([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $pad = [Math]::Max(1, [int]($size * 0.08))
    $g.Clear([System.Drawing.Color]::FromArgb(255, 37, 99, 235))

    $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 219, 234, 254))
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.0, $size / 12.0))
    $inner = $size - $pad * 2

    $rect = New-Object System.Drawing.RectangleF $pad, ($pad + $inner * 0.08), ($inner * 0.46), ($inner * 0.34)
    $g.FillRectangle($fill, $rect)
    $g.DrawRectangle($pen, $rect.X, $rect.Y, $rect.Width, $rect.Height)

    $ellipse = New-Object System.Drawing.RectangleF ($pad + $inner * 0.52), ($pad + $inner * 0.05), ($inner * 0.4), ($inner * 0.4)
    $g.FillEllipse($fill, $ellipse)
    $g.DrawEllipse($pen, $ellipse)

    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.0, $size / 14.0))
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($linePen, ($pad + $inner * 0.12), ($pad + $inner * 0.82), ($pad + $inner * 0.88), ($pad + $inner * 0.22))
    $linePen.Dispose()

    $pen.Dispose()
    $fill.Dispose()
    $g.Dispose()
    return $bmp
}

function New-SvgEditorIconBitmap([int]$size) {
    if ($size -le 24) { return New-SvgEditorIconSimple $size }
    if ($size -eq 256) { return New-SvgEditorIconDetailed 256 }
    $detailed = New-SvgEditorIconDetailed 256
    try { return Scale-Bitmap $detailed $size }
    finally { $detailed.Dispose() }
}

$assetsDir = Join-Path $PSScriptRoot "..\Assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

$outPath = Join-Path $assetsDir "AppIcon.ico"
Save-MultiSizeIcon -Path $outPath -Sizes @(16, 24, 32, 48, 64, 128, 256) -DrawBitmap ${function:New-SvgEditorIconBitmap}
Write-Host "Created $outPath"
