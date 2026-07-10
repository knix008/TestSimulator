Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

# ── Helpers ─────────────────────────────────────────────────────────────────

function New-Bmp([int]$sz) {
    New-Object System.Drawing.Bitmap($sz, $sz,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Get-Gfx([System.Drawing.Bitmap]$bmp) {
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $g.Clear([System.Drawing.Color]::Transparent)
    return $g
}

function New-RRPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r2 = [float]($r * 2.0)
    $path.AddArc($x,               $y,               $r2, $r2, 180.0, 90.0)
    $path.AddArc([float]($x+$w-$r2), $y,               $r2, $r2, 270.0, 90.0)
    $path.AddArc([float]($x+$w-$r2), [float]($y+$h-$r2), $r2, $r2,   0.0, 90.0)
    $path.AddArc($x,               [float]($y+$h-$r2), $r2, $r2,  90.0, 90.0)
    $path.CloseFigure()
    return $path
}

function Get-PngBytes([System.Drawing.Bitmap]$bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    return ,$ms.ToArray()
}

# Packs bitmaps into an ICO file using PNG-compressed images (Vista+ format)
function Save-Ico([string]$path, [System.Drawing.Bitmap[]]$bitmaps) {
    $pngs  = @($bitmaps | ForEach-Object { ,(Get-PngBytes $_) })
    $count = $bitmaps.Count
    $ms    = New-Object System.IO.MemoryStream
    $w     = New-Object System.IO.BinaryWriter($ms)

    # ICONDIR header
    $w.Write([uint16]0)
    $w.Write([uint16]1)
    $w.Write([uint16]$count)

    $offset = [uint32](6 + 16 * $count)
    for ($i = 0; $i -lt $count; $i++) {
        $dim  = $bitmaps[$i].Width
        $bDim = if ($dim -ge 256) { [byte]0 } else { [byte]$dim }
        $w.Write($bDim)
        $w.Write($bDim)
        $w.Write([byte]0)
        $w.Write([byte]0)
        $w.Write([uint16]1)
        $w.Write([uint16]32)
        $w.Write([uint32]$pngs[$i].Length)
        $w.Write([uint32]$offset)
        $offset += [uint32]$pngs[$i].Length
    }
    foreach ($png in $pngs) { $w.Write($png, 0, $png.Length) }

    $w.Flush()
    [System.IO.File]::WriteAllBytes($path, $ms.ToArray())
    $w.Dispose(); $ms.Dispose()
}

# ==============================================================================
# APP ICON  ·  bright sky-blue · gloss reflection · white 3-disc DB cylinder
# ==============================================================================
function Draw-AppIcon([int]$sz) {
    $bmp = New-Bmp $sz
    $g   = Get-Gfx $bmp
    $s   = $sz / 16.0

    $p   = [float]($s * 0.35)
    $r   = [float]($s * 3.2)
    $bgW = [float]($sz - $p * 2)
    $bgH = [float]($sz - $p * 2)
    $bg  = New-RRPath $p $p $bgW $bgH $r

    # ── Bright blue diagonal gradient ────────────────────────────────────────
    #   top-left: #60C4FC (sky blue)  →  bottom-right: #0A5AC8 (vivid blue)
    $pt1 = New-Object System.Drawing.PointF($p, $p)
    $pt2 = New-Object System.Drawing.PointF([float]($p + $bgW), [float]($p + $bgH))
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $pt1, $pt2,
        [System.Drawing.Color]::FromArgb(255, 96, 196, 252),
        [System.Drawing.Color]::FromArgb(255, 10, 90, 200))
    $g.FillPath($bgBrush, $bg)
    $bgBrush.Dispose()

    # ── Glass gloss: lens-shaped white highlight on upper portion ────────────
    #   Clip drawing to the rounded square so gloss stays inside the shape.
    $g.SetClip($bg)

    $glossPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gx = [float]($p - $bgW * 0.06)
    $gy = [float]($p - $bgH * 0.28)
    $gw = [float]($bgW * 1.12)
    $gh = [float]($bgH * 0.80)
    $glossPath.AddEllipse($gx, $gy, $gw, $gh)

    $gp1 = New-Object System.Drawing.PointF(0.0, $gy)
    $gp2 = New-Object System.Drawing.PointF(0.0, [float]($gy + $gh))
    $glossBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $gp1, $gp2,
        [System.Drawing.Color]::FromArgb(155, 255, 255, 255),
        [System.Drawing.Color]::FromArgb(0,   255, 255, 255))
    $g.FillPath($glossBrush, $glossPath)
    $glossBrush.Dispose()
    $glossPath.Dispose()

    $g.ResetClip()

    # Thin dark-blue border around the rounded square
    $borderPen = New-Object System.Drawing.Pen(
        [System.Drawing.Color]::FromArgb(55, 0, 40, 130), [float]($s * 0.7))
    $g.DrawPath($borderPen, $bg)
    $borderPen.Dispose()
    $bg.Dispose()

    # ── Text foreground: "DB" (large) + "Tools" (small below) ────────────────
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment     = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $dbFontSz   = [float]($s * 7.5)
    $toolFontSz = [float]($s * 3.0)
    $shadowOff  = [float]($s * 0.6)

    $dbFont   = New-Object System.Drawing.Font("Segoe UI", $dbFontSz,
                    [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $toolFont = New-Object System.Drawing.Font("Segoe UI", $toolFontSz,
                    [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    $dbRect       = New-Object System.Drawing.RectangleF(0.0, 0.0, [float]$sz, [float]($sz * 0.63))
    $toolRect     = New-Object System.Drawing.RectangleF(0.0, [float]($sz * 0.59), [float]$sz, [float]($sz * 0.41))
    $dbShdRect    = New-Object System.Drawing.RectangleF($shadowOff, $shadowOff, [float]$sz, [float]($sz * 0.63))
    $toolShdRect  = New-Object System.Drawing.RectangleF($shadowOff, [float]($sz * 0.59 + $shadowOff), [float]$sz, [float]($sz * 0.41))

    # Drop shadow
    $shadowBr = New-Object System.Drawing.SolidBrush(
        [System.Drawing.Color]::FromArgb(90, 0, 20, 80))
    $g.DrawString("DB",    $dbFont,   $shadowBr, $dbShdRect,   $sf)
    $g.DrawString("Tools", $toolFont, $shadowBr, $toolShdRect, $sf)
    $shadowBr.Dispose()

    # White text
    $whiteBr = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.DrawString("DB",    $dbFont,   $whiteBr, $dbRect,   $sf)
    $g.DrawString("Tools", $toolFont, $whiteBr, $toolRect, $sf)
    $whiteBr.Dispose()

    $dbFont.Dispose(); $toolFont.Dispose(); $sf.Dispose()

    $g.Dispose()
    return $bmp
}

# ==============================================================================
# FILE ICONS  ·  white document with folded corner, accent header, data lines
#   accentR/G/B — header colour    label — 2-3 char header text
# ==============================================================================
function Draw-FileIcon([int]$sz, [int]$accentR, [int]$accentG, [int]$accentB, [string]$label) {
    $bmp = New-Bmp $sz
    $g   = Get-Gfx $bmp
    $s   = $sz / 16.0

    $m    = [float]($s * 1.6)
    $fold = [float]($s * 3.8)
    $dW   = [float]($sz - $m * 2)
    $dH   = [float]($sz - $m * 2)

    # ── Document polygon (rectangle with folded top-right corner) ───────────
    $pts = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($m,               $m)
        [System.Drawing.PointF]::new([float]($m+$dW-$fold), $m)
        [System.Drawing.PointF]::new([float]($m+$dW),       [float]($m+$fold))
        [System.Drawing.PointF]::new([float]($m+$dW),       [float]($m+$dH))
        [System.Drawing.PointF]::new($m,               [float]($m+$dH))
    )

    # Soft drop-shadow
    $sh      = [float]($s * 0.8)
    $shadow  = $pts | ForEach-Object {
        [System.Drawing.PointF]::new([float]($_.X + $sh), [float]($_.Y + $sh))
    }
    $sbrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 0, 0, 0))
    $g.FillPolygon($sbrush, $shadow)
    $sbrush.Dispose()

    # White document body
    $bbrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(251, 252, 255))
    $g.FillPolygon($bbrush, $pts)
    $bbrush.Dispose()

    # Fold triangle
    $fpts = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new([float]($m+$dW-$fold), $m)
        [System.Drawing.PointF]::new([float]($m+$dW),       [float]($m+$fold))
        [System.Drawing.PointF]::new([float]($m+$dW-$fold), [float]($m+$fold))
    )
    $fbrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215, 222, 238))
    $g.FillPolygon($fbrush, $fpts)
    $fbrush.Dispose()

    # ── Accent header band ──────────────────────────────────────────────────
    $hH   = [float]($s * 4.8)
    $hpts = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($m,               $m)
        [System.Drawing.PointF]::new([float]($m+$dW-$fold), $m)
        [System.Drawing.PointF]::new([float]($m+$dW-$fold), [float]($m+$hH))
        [System.Drawing.PointF]::new($m,               [float]($m+$hH))
    )
    $acBrush = New-Object System.Drawing.SolidBrush(
        [System.Drawing.Color]::FromArgb(255, $accentR, $accentG, $accentB))
    $g.FillPolygon($acBrush, $hpts)
    $acBrush.Dispose()

    # Label inside header
    if ($sz -ge 24 -and $label -ne '') {
        $fs   = [float]($s * 4.0)
        $font = New-Object System.Drawing.Font(
            'Consolas', $fs, [System.Drawing.FontStyle]::Bold,
            [System.Drawing.GraphicsUnit]::Point)
        $tb   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $sf   = New-Object System.Drawing.StringFormat
        $sf.Alignment     = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $g.DrawString($label, $font, $tb,
            [System.Drawing.RectangleF]::new($m, $m, [float]($dW - $fold), $hH), $sf)
        $font.Dispose()
        $tb.Dispose()
    }

    # ── Horizontal content lines (schema rows) ──────────────────────────────
    $lpen  = New-Object System.Drawing.Pen(
        [System.Drawing.Color]::FromArgb(38, 100, 130, 185), [float]($s * 0.7))
    $lx1   = [float]($m + $s * 1.5)
    $lx2   = [float]($m + $dW - $s * 2.2)
    $ly0   = [float]($m + $hH + $s * 2.2)
    $lStep = [float]($s * 2.2)
    $lyMax = [float]($m + $dH - $s * 1.0)
    for ($i = 0; $i -lt 4; $i++) {
        $ly = [float]($ly0 + $i * $lStep)
        if ($ly + 1 -lt $lyMax) {
            $g.DrawLine($lpen, $lx1, $ly, $lx2, $ly)
        }
    }
    $lpen.Dispose()

    # ── Document outline ────────────────────────────────────────────────────
    $oPen = New-Object System.Drawing.Pen(
        [System.Drawing.Color]::FromArgb(155, 168, 192), [float]($s * 0.75))
    $g.DrawPolygon($oPen, $pts)
    $g.DrawPolygon($oPen, $fpts)
    $oPen.Dispose()

    $g.Dispose()
    return $bmp
}

# ==============================================================================
# Generate all icons
# ==============================================================================
$sizes    = @(16, 32, 48, 64, 128, 256)
$assetsDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'Assets'

# AppIcon.ico
$bmps = @($sizes | ForEach-Object { Draw-AppIcon $_ })
Save-Ico (Join-Path $assetsDir 'AppIcon.ico') $bmps
$bmps | ForEach-Object { $_.Dispose() }
Write-Host 'Created AppIcon.ico' -ForegroundColor Cyan

# FileIcon.ico  — blue (#1646A0)
$bmps = @($sizes | ForEach-Object { Draw-FileIcon $_ 22 70 160 'DB' })
Save-Ico (Join-Path $assetsDir 'FileIcon.ico') $bmps
$bmps | ForEach-Object { $_.Dispose() }
Write-Host 'Created FileIcon.ico' -ForegroundColor Cyan

# mdprj_file.ico  — teal (#006573)
$bmps = @($sizes | ForEach-Object { Draw-FileIcon $_ 0 101 115 'PRJ' })
Save-Ico (Join-Path $assetsDir 'mdprj_file.ico') $bmps
$bmps | ForEach-Object { $_.Dispose() }
Write-Host 'Created mdprj_file.ico' -ForegroundColor Cyan

Write-Host ''
Write-Host 'Done — all icons generated.' -ForegroundColor Green
