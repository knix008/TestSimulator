Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "IconWriter.ps1")

# Modern Fluent palette
$TileTop = [System.Drawing.Color]::FromArgb(255, 79, 70, 229)      # indigo-600
$TileBottom = [System.Drawing.Color]::FromArgb(255, 225, 29, 72)   # rose-600
$PdfAccent = [System.Drawing.Color]::FromArgb(255, 244, 63, 94)    # rose-500
$PdfAccentDark = [System.Drawing.Color]::FromArgb(255, 190, 18, 60)  # rose-700
$Ink = [System.Drawing.Color]::FromArgb(255, 30, 41, 59)            # slate-800
$Muted = [System.Drawing.Color]::FromArgb(255, 148, 163, 184)        # slate-400
$Surface = [System.Drawing.Color]::FromArgb(255, 248, 250, 252)     # slate-50
$AccentBlue = [System.Drawing.Color]::FromArgb(255, 59, 130, 246)   # blue-500

function Fill-ModernTileBackground(
    [System.Drawing.Graphics]$g,
    [int]$size,
    [float]$scale) {

    $tileRect = New-Object System.Drawing.RectangleF (10*$scale), (10*$scale), (236*$scale), (236*$scale)
    $tileRadius = 52.0 * $scale

    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $tileRect, $TileTop, $TileBottom, 135.0)
    Fill-RoundedRect $g $bgBrush $tileRect $tileRadius
    $bgBrush.Dispose()

    if ($size -ge 32) {
        $glowRect = New-Object System.Drawing.RectangleF (28*$scale), (18*$scale), (170*$scale), (90*$scale)
        $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $glowPath.AddEllipse($glowRect)
        $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
        $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(72, 255, 255, 255)
        $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
        $g.FillPath($glowBrush, $glowPath)
        $glowBrush.Dispose()
        $glowPath.Dispose()
    }
}

function Draw-ModernSplitCard(
    [System.Drawing.Graphics]$g,
    [float]$scale,
    [bool]$detailed) {

    $cardRect = New-Object System.Drawing.RectangleF (34*$scale), (58*$scale), (188*$scale), (140*$scale)
    $cardRadius = 22.0 * $scale

    Draw-SoftShadow $g $cardRect $cardRadius $scale 56 (5.0 * $scale)

    $cardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(250, 255, 255, 255))
    Fill-RoundedRect $g $cardBrush $cardRect $cardRadius
    $cardBrush.Dispose()

    $splitX = $cardRect.X + $cardRect.Width * 0.54
    $leftRect = New-Object System.Drawing.RectangleF ($cardRect.X + 10*$scale), ($cardRect.Y + 12*$scale), ($splitX - $cardRect.X - 14*$scale), ($cardRect.Height - 24*$scale)
    $rightRect = New-Object System.Drawing.RectangleF ($splitX + 4*$scale), ($cardRect.Y + 12*$scale), ($cardRect.Right - $splitX - 14*$scale), ($cardRect.Height - 24*$scale)
    $innerRadius = 14.0 * $scale

    $leftBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 241, 245, 249))
    Fill-RoundedRect $g $leftBg $leftRect $innerRadius
    $leftBg.Dispose()

    $rightBg = New-Object System.Drawing.SolidBrush $Surface
    Fill-RoundedRect $g $rightBg $rightRect $innerRadius
    $rightBg.Dispose()

    if ($detailed) {
        $dividerPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 100, 116, 139)), 1
        $g.DrawLine($dividerPen, $splitX, ($cardRect.Y + 18*$scale), $splitX, ($cardRect.Bottom - 18*$scale))
        $dividerPen.Dispose()
    }

    Draw-ModernPdfSide $g $leftRect $scale $detailed
    Draw-ModernEditSide $g $rightRect $scale $detailed
}

function Draw-ModernPdfSide(
    [System.Drawing.Graphics]$g,
    [System.Drawing.RectangleF]$rect,
    [float]$scale,
    [bool]$detailed) {

    $pillH = [Math]::Max(8.0, 20.0 * $scale)
    $pillRect = New-Object System.Drawing.RectangleF ($rect.X + 8*$scale), ($rect.Y + 8*$scale), ($rect.Width - 16*$scale), $pillH
    $pillBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $pillRect, $PdfAccent, $PdfAccentDark, 0.0)
    Fill-RoundedRect $g $pillBrush $pillRect ([Math]::Max(4.0, 8.0 * $scale))
    $pillBrush.Dispose()

    if ($rect.Height -lt 22 * $scale) { return }

    if ($detailed -and $rect.Height -ge 28 * $scale) {
        $fontSize = [Math]::Max(5.0, 9.5 * $scale)
        $font = New-Object System.Drawing.Font "Segoe UI Semibold", $fontSize, ([System.Drawing.FontStyle]::Bold)
        $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $g.DrawString("PDF", $font, $textBrush, $pillRect, $sf)
        $font.Dispose()
        $textBrush.Dispose()
        $sf.Dispose()
    }

    $thumbRect = New-Object System.Drawing.RectangleF ($rect.X + 10*$scale), ($pillRect.Bottom + 8*$scale), ($rect.Width - 20*$scale), ($rect.Height * 0.42)
    $thumbBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $thumbRect,
        [System.Drawing.Color]::FromArgb(255, 226, 232, 240),
        [System.Drawing.Color]::FromArgb(255, 203, 213, 225),
        90.0)
    Fill-RoundedRect $g $thumbBrush $thumbRect ([Math]::Max(3.0, 7.0 * $scale))
    $thumbBrush.Dispose()

    if ($detailed -and $rect.Height -ge 36 * $scale) {
        $mountainBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
        $peak1 = @(
            (New-Object System.Drawing.PointF ($thumbRect.X + 8*$scale), ($thumbRect.Bottom - 6*$scale)),
            (New-Object System.Drawing.PointF ($thumbRect.X + 22*$scale), ($thumbRect.Y + 14*$scale)),
            (New-Object System.Drawing.PointF ($thumbRect.X + 38*$scale), ($thumbRect.Bottom - 6*$scale))
        )
        $peak2 = @(
            (New-Object System.Drawing.PointF ($thumbRect.X + 24*$scale), ($thumbRect.Bottom - 6*$scale)),
            (New-Object System.Drawing.PointF ($thumbRect.X + 42*$scale), ($thumbRect.Y + 20*$scale)),
            (New-Object System.Drawing.PointF ($thumbRect.Right - 8*$scale), ($thumbRect.Bottom - 6*$scale))
        )
        $g.FillPolygon($mountainBrush, $peak1)
        $g.FillPolygon($mountainBrush, $peak2)
        $mountainBrush.Dispose()
    }

    $lineY = $thumbRect.Bottom + 9*$scale
    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 203, 213, 225)), ([Math]::Max(1.0, 2.5 * $scale))
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    for ($i = 0; $i -lt 2; $i++) {
        $w = if ($i -eq 1) { ($rect.Width - 24*$scale) * 0.7 } else { ($rect.Width - 24*$scale) }
        $g.DrawLine($linePen, ($rect.X + 12*$scale), $lineY, ($rect.X + 12*$scale + $w), $lineY)
        $lineY += 7*$scale
    }
    $linePen.Dispose()
}

function Draw-ModernEditSide(
    [System.Drawing.Graphics]$g,
    [System.Drawing.RectangleF]$rect,
    [float]$scale,
    [bool]$detailed) {

    $dotY = $rect.Y + 10*$scale
    $dotColors = @(
        [System.Drawing.Color]::FromArgb(255, 248, 113, 113),
        [System.Drawing.Color]::FromArgb(255, 250, 204, 21),
        [System.Drawing.Color]::FromArgb(255, 74, 222, 128))
    $dotX = $rect.X + 10*$scale
    foreach ($color in $dotColors) {
        $dotRect = New-Object System.Drawing.RectangleF $dotX, $dotY, (5*$scale), (5*$scale)
        $dotBrush = New-Object System.Drawing.SolidBrush $color
        $g.FillEllipse($dotBrush, $dotRect)
        $dotBrush.Dispose()
        $dotX += 8*$scale
    }

    $lineY = $rect.Y + 24*$scale
    $lineH = [Math]::Max(3.0, 5.0 * $scale)
    $gap = [Math]::Max(4.0, 7.0 * $scale)
    $widths = @(1.0, 0.92, 0.78, 0.55)

    for ($i = 0; $i -lt $widths.Length; $i++) {
        $w = ($rect.Width - 18*$scale) * $widths[$i]
        $lineRect = New-Object System.Drawing.RectangleF ($rect.X + 9*$scale), $lineY, $w, $lineH
        $lineColor = if ($i -eq 3) { $AccentBlue } else { $Muted }
        $lineBrush = New-Object System.Drawing.SolidBrush $lineColor
        Fill-RoundedRect $g $lineBrush $lineRect ($lineH / 2.0)
        $lineBrush.Dispose()
        $lineY += $lineH + $gap
    }

    if ($detailed -and $rect.Height -ge 30 * $scale) {
        $cursorRect = New-Object System.Drawing.RectangleF ($rect.X + 9*$scale + ($rect.Width - 18*$scale) * 0.55 + 3*$scale), ($rect.Y + 24*$scale), (2.2*$scale), (18*$scale)
        $cursorBrush = New-Object System.Drawing.SolidBrush $AccentBlue
        Fill-RoundedRect $g $cursorBrush $cursorRect (1.0 * $scale)
        $cursorBrush.Dispose()
    }
}

function New-PdfEditorIconDetailed([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $s = $size / 256.0

    $g.Clear([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
    Fill-ModernTileBackground $g $size $s
    Draw-ModernSplitCard $g $s $true

    $g.Dispose()
    return $bmp
}

function New-PdfEditorIconSimple([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $s = $size / 256.0

    $g.Clear($TileTop)
    $tileRect = New-Object System.Drawing.RectangleF (2*$s), (2*$s), ($size - 4*$s), ($size - 4*$s)
    $tileBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($tileRect, $TileTop, $TileBottom, 135.0)
    Fill-RoundedRect $g $tileBrush $tileRect ([Math]::Max(2.0, 18.0 * $s))
    $tileBrush.Dispose()

    Draw-ModernSplitCard $g $s $false

    $g.Dispose()
    return $bmp
}

function New-PdfEditorIconBitmap([int]$size) {
    if ($size -le 24) { return New-PdfEditorIconSimple $size }
    if ($size -eq 256) { return New-PdfEditorIconDetailed 256 }
    $detailed = New-PdfEditorIconDetailed 256
    try { return Scale-Bitmap $detailed $size }
    finally { $detailed.Dispose() }
}

$assetsDir = Join-Path $PSScriptRoot "..\Assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
$outPath = Join-Path $assetsDir "AppIcon.ico"
Save-MultiSizeIcon -Path $outPath -Sizes @(16, 24, 32, 48, 64, 128, 256) -DrawBitmap ${function:New-PdfEditorIconBitmap}
Write-Host "Created $outPath"
