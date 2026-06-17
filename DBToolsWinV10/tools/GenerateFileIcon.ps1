Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "IconWriter.ps1")

$Accent = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
$TableHeader = [System.Drawing.Color]::FromArgb(255, 90, 90, 140)
$TableBorder = [System.Drawing.Color]::FromArgb(255, 71, 85, 105)

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

    $accent = New-Object System.Drawing.SolidBrush $Accent
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

    $t1 = New-Object System.Drawing.RectangleF ($inner.X + 8*$s), ($inner.Y + 18*$s), (48*$s), (34*$s)
    $t2 = New-Object System.Drawing.RectangleF ($inner.X + 78*$s), ($inner.Y + 10*$s), (40*$s), (30*$s)
    $t3 = New-Object System.Drawing.RectangleF ($inner.X + 52*$s), ($inner.Y + 72*$s), (42*$s), (30*$s)
    Draw-DbTable $g $t1 $TableHeader $TableBorder $s 2
    Draw-DbTable $g $t2 ([System.Drawing.Color]::FromArgb(255, 52, 101, 164)) $TableBorder $s 2
    Draw-DbTable $g $t3 ([System.Drawing.Color]::FromArgb(255, 0, 114, 66)) $TableBorder $s 2

    if ($size -ge 32) {
        $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 71, 85, 105)), ([Math]::Max(1.4, 2.4*$s))
        $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $p1 = New-Object System.Drawing.PointF $t1.Right, ($t1.Y + 12*$s)
        $p2 = New-Object System.Drawing.PointF $t2.X, ($t2.Y + 10*$s)
        $p3 = New-Object System.Drawing.PointF ($t2.X + $t2.Width/2), $t2.Bottom
        $p4 = New-Object System.Drawing.PointF ($t3.X + $t3.Width/2), $t3.Y
        $g.DrawLine($linePen, $p1, $p2)
        $g.DrawLine($linePen, $p3, $p4)
        $linePen.Dispose()
    }

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

    $accent = New-Object System.Drawing.SolidBrush $Accent
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
    $table = New-Object System.Drawing.RectangleF $innerX, $innerY, $innerW, $innerH
    Draw-DbTable $g $table $TableHeader $TableBorder ($size / 32.0) 2

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
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

foreach ($name in @("FileIcon.ico", "mdprj_file.ico")) {
    $outPath = Join-Path $assetsDir $name
    Save-MultiSizeIcon -Path $outPath -Sizes @(16, 24, 32, 48, 64, 128, 256) -DrawBitmap ${function:New-FileIconBitmap}
    Write-Host "Created $outPath"
}
