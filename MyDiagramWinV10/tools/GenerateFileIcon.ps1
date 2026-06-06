Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "IconWriter.ps1")

function New-FileIconDetailed([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $g.Clear([System.Drawing.Color]::Transparent)
    $s = $size / 256.0

    $doc = New-Object System.Drawing.RectangleF (36*$s), (22*$s), (176*$s), (206*$s)
    $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(55, 15, 23, 42))
    $g.FillRectangle($shadow, $doc.X + 5*$s, $doc.Y + 5*$s, $doc.Width, $doc.Height)
    $shadow.Dispose()

    $paper = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillRectangle($paper, $doc)
    $paper.Dispose()

    $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
    $g.FillRectangle($accent, $doc.X, $doc.Y, 12*$s, $doc.Height)
    $accent.Dispose()

    $border = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 100, 116, 139)), ([Math]::Max(1.2, 2.4*$s))
    $g.DrawRectangle($border, $doc.X, $doc.Y, $doc.Width, $doc.Height)
    $border.Dispose()

    $foldSize = 30*$s
    $foldPts = @(
        (New-Object System.Drawing.PointF ($doc.Right - $foldSize), $doc.Y),
        (New-Object System.Drawing.PointF $doc.Right, $doc.Y),
        (New-Object System.Drawing.PointF $doc.Right, ($doc.Y + $foldSize))
    )
    $foldFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 226, 232, 240))
    $g.FillPolygon($foldFill, $foldPts)
    $foldFill.Dispose()
    $foldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 148, 163, 184)), ([Math]::Max(1.0, 1.8*$s))
    $g.DrawLine($foldPen, $foldPts[0], $foldPts[2])
    $g.DrawLine($foldPen, $foldPts[1], $foldPts[2])
    $foldPen.Dispose()

    $inner = New-Object System.Drawing.RectangleF ($doc.X + 26*$s), ($doc.Y + 36*$s), ($doc.Width - 42*$s), ($doc.Height - 56*$s)
    if ($size -ge 32) {
        $gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(30, 148, 163, 184)), 1
        $step = [Math]::Max(4, [int](16*$s))
        for ($x = [int]$inner.Left; $x -le $inner.Right; $x += $step) {
            $g.DrawLine($gridPen, $x, $inner.Top, $x, $inner.Bottom)
        }
        for ($y = [int]$inner.Top; $y -le $inner.Bottom; $y += $step) {
            $g.DrawLine($gridPen, $inner.Left, $y, $inner.Right, $y)
        }
        $gridPen.Dispose()
    }

    $r1 = New-Object System.Drawing.RectangleF ($inner.X + 10*$s), ($inner.Y + 20*$s), (44*$s), (30*$s)
    $r2 = New-Object System.Drawing.RectangleF ($inner.X + 80*$s), ($inner.Y + 12*$s), (34*$s), (34*$s)
    $r3 = New-Object System.Drawing.RectangleF ($inner.X + 54*$s), ($inner.Y + 74*$s), (38*$s), (30*$s)

    if ($size -ge 32) {
        $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 71, 85, 105)), ([Math]::Max(1.4, 2.6*$s))
        $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $p1 = New-Object System.Drawing.PointF $r1.Right, ($r1.Y + $r1.Height/2)
        $p2 = New-Object System.Drawing.PointF $r2.X, ($r2.Y + $r2.Height/2)
        $p3 = New-Object System.Drawing.PointF ($r2.X + $r2.Width/2), $r2.Bottom
        $p4 = New-Object System.Drawing.PointF ($r3.X + $r3.Width/2), $r3.Y
        $g.DrawLine($linePen, $p1, $p2)
        $g.DrawLine($linePen, $p3, $p4)
        $linePen.Dispose()
    }

    $fill1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 219, 234, 254))
    $pen1 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 37, 99, 235)), ([Math]::Max(1.2, 2.2*$s))
    $g.FillRectangle($fill1, $r1); $g.DrawRectangle($pen1, $r1.X, $r1.Y, $r1.Width, $r1.Height)
    $fill1.Dispose(); $pen1.Dispose()

    $fill2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 209, 250, 229))
    $pen2 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 16, 185, 129)), ([Math]::Max(1.2, 2.2*$s))
    $g.FillEllipse($fill2, $r2); $g.DrawEllipse($pen2, $r2)
    $fill2.Dispose(); $pen2.Dispose()

    $fill3 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 254, 243, 199))
    $pen3 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 245, 158, 11)), ([Math]::Max(1.2, 2.2*$s))
    $g.FillRectangle($fill3, $r3); $g.DrawRectangle($pen3, $r3.X, $r3.Y, $r3.Width, $r3.Height)
    $fill3.Dispose(); $pen3.Dispose()

    $g.Dispose()
    return $bmp
}

function New-FileIconSimple([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $g.Clear([System.Drawing.Color]::Transparent)
    $pad = [Math]::Max(1, [int]($size * 0.08))
    $docW = $size - $pad * 2
    $docH = [int]($docW * 1.12)
    $docX = $pad
    $docY = $size - $pad - $docH

    $paper = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillRectangle($paper, $docX, $docY, $docW, $docH)
    $paper.Dispose()

    $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
    $stripe = [Math]::Max(2, [int]($docW * 0.12))
    $g.FillRectangle($accent, $docX, $docY, $stripe, $docH)
    $accent.Dispose()

    $border = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 100, 116, 139)), ([Math]::Max(1.0, $size / 14.0))
    $g.DrawRectangle($border, $docX, $docY, $docW, $docH)
    $border.Dispose()

    $innerX = $docX + $stripe + [Math]::Max(2, [int]($docW * 0.08))
    $innerY = $docY + [Math]::Max(2, [int]($docH * 0.16))
    $innerW = $docX + $docW - $innerX - [Math]::Max(2, [int]($docW * 0.08))
    $innerH = $docH * 0.34
    $shapePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 37, 99, 235)), ([Math]::Max(1.0, $size / 12.0))
    $shapeFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 219, 234, 254))
    $g.FillRectangle($shapeFill, $innerX, $innerY, $innerW, $innerH)
    $g.DrawRectangle($shapePen, $innerX, $innerY, $innerW, $innerH)
    $shapePen.Dispose(); $shapeFill.Dispose()

    $g.Dispose()
    return $bmp
}

function New-FileIconBitmap([int]$size) {
    if ($size -le 24) { return New-FileIconSimple $size }
    if ($size -eq 256) { return New-FileIconDetailed 256 }
    $detailed = New-FileIconDetailed 256
    try { return Scale-Bitmap $detailed $size }
    finally { $detailed.Dispose() }
}

$assetsDir = Join-Path $PSScriptRoot "..\Assets"
$installerAssetsDir = Join-Path $PSScriptRoot "..\installer\assets"
New-Item -ItemType Directory -Force -Path $assetsDir, $installerAssetsDir | Out-Null

foreach ($outPath in @(
    (Join-Path $assetsDir "FileIcon.ico"),
    (Join-Path $installerAssetsDir "FileIcon.ico"))) {
    Save-MultiSizeIcon -Path $outPath -Sizes @(16, 24, 32, 48, 64, 128, 256) -DrawBitmap ${function:New-FileIconBitmap}
    Write-Host "Created $outPath"
}
