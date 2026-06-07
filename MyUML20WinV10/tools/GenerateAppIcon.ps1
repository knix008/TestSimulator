Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "IconWriter.ps1")

function Draw-UmlClassBox {
    param(
        [System.Drawing.Graphics]$g,
        [System.Drawing.RectangleF]$rect,
        [System.Drawing.Pen]$borderPen,
        [System.Drawing.Brush]$fillBrush,
        [int]$compartments = 3
    )

    $g.FillRectangle($fillBrush, $rect)
    $g.DrawRectangle($borderPen, $rect.X, $rect.Y, $rect.Width, $rect.Height)

    for ($i = 1; $i -lt $compartments; $i++) {
        $lineY = $rect.Y + ($rect.Height * $i / $compartments)
        $g.DrawLine($borderPen, $rect.Left, $lineY, $rect.Right, $lineY)
    }
}

function New-AppIconDetailed([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $s = $size / 256.0

    $bgRect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.Color]::FromArgb(255, 30, 27, 75),
        [System.Drawing.Color]::FromArgb(255, 67, 56, 202),
        145.0)
    $g.FillRectangle($bgBrush, $bgRect)
    $bgBrush.Dispose()

    $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $border = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 30, 27, 75)), ([Math]::Max(2.0, 3.2 * $s))

    $parent = New-Object System.Drawing.RectangleF (48 * $s), (36 * $s), (108 * $s), (78 * $s)
    $child = New-Object System.Drawing.RectangleF (100 * $s), (148 * $s), (108 * $s), (78 * $s)
    Draw-UmlClassBox $g $parent $border $fill 3
    Draw-UmlClassBox $g $child $border $fill 3

    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 30, 27, 75)), ([Math]::Max(2.0, 3.0 * $s))
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $start = New-Object System.Drawing.PointF ($parent.X + $parent.Width / 2), $parent.Bottom
    $shaftEnd = New-Object System.Drawing.PointF ($child.X + $child.Width / 2), ($child.Y - 16 * $s)
    $g.DrawLine($linePen, $start, $shaftEnd)

    $tip = New-Object System.Drawing.PointF ($child.X + $child.Width / 2), $child.Y
    $baseY = $child.Y - 14 * $s
    $g.DrawPolygon($linePen, @(
        $tip,
        (New-Object System.Drawing.PointF ($tip.X - 12 * $s), $baseY),
        (New-Object System.Drawing.PointF ($tip.X + 12 * $s), $baseY)
    ))
    $linePen.Dispose()

    if ($size -ge 40) {
        $fontSize = [single]([Math]::Max(7, 22 * $s))
        $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold)
        $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
        $label = "UML"
        $labelSize = $g.MeasureString($label, $font)
        $g.DrawString($label, $font, $textBrush, ($size - $labelSize.Width) / 2, (214 * $s))
        $font.Dispose()
        $textBrush.Dispose()
    }

    $border.Dispose()
    $fill.Dispose()
    $g.Dispose()
    return $bmp
}

function New-AppIconSimple([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $g.Clear([System.Drawing.Color]::FromArgb(255, 49, 46, 129))

    $pad = [Math]::Max(2, [int]($size * 0.12))
    $boxW = $size - $pad * 2
    $boxH = $boxW * 0.68
    $x = $pad
    $y = $pad

    $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 30, 27, 75)), ([Math]::Max(1.2, $size / 12.0))
    $rect = New-Object System.Drawing.RectangleF $x, $y, $boxW, $boxH
    Draw-UmlClassBox $g $rect $pen $fill 3

    $triY = $rect.Bottom + ($size * 0.06)
    $cx = $size / 2.0
    $g.DrawLine($pen, $cx, $rect.Bottom, $cx, $triY)
    $g.DrawLines($pen, @(
        (New-Object System.Drawing.PointF $cx, ($triY + $size * 0.08)),
        (New-Object System.Drawing.PointF ($cx - $size * 0.08), $triY),
        (New-Object System.Drawing.PointF ($cx + $size * 0.08), $triY)
    ))

    $pen.Dispose()
    $fill.Dispose()
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
