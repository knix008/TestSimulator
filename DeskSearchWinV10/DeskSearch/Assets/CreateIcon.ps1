Add-Type -AssemblyName System.Drawing

$assetsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pngPath = Join-Path $assetsDir "app.png"
$icoPath = Join-Path $assetsDir "app.ico"

$PrimaryBlue = [System.Drawing.Color]::FromArgb(255, 0, 120, 212)
$DarkBlue = [System.Drawing.Color]::FromArgb(255, 0, 90, 158)
$LightBlue = [System.Drawing.Color]::FromArgb(255, 199, 224, 255)
$White = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)

function New-DrawingPen {
    param(
        [System.Drawing.Color]$Color,
        [float]$Width
    )

    return New-Object System.Drawing.Pen($Color, $Width)
}

function New-DeskSearchBitmap {
    param([int]$Size = 256)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = $Size / 256.0
    $cx = 118 * $s
    $cy = 108 * $s
    $radius = 50 * $s
    $stroke = [Math]::Max(4.0, 10 * $s)

    $outlinePen = New-DrawingPen -Color $DarkBlue -Width ($stroke + (2 * $s))
    $outlinePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $outlinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $outlinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $ringPen = New-DrawingPen -Color $PrimaryBlue -Width $stroke
    $ringPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $g.DrawEllipse($outlinePen, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)
    $g.DrawEllipse($ringPen, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)

    $handleStartX = $cx + ($radius * 0.62)
    $handleStartY = $cy + ($radius * 0.62)
    $handleEndX = $cx + ($radius * 1.45)
    $handleEndY = $cy + ($radius * 1.45)
    $g.DrawLine($outlinePen, $handleStartX, $handleStartY, $handleEndX, $handleEndY)
    $g.DrawLine($ringPen, $handleStartX, $handleStartY, $handleEndX, $handleEndY)

    if ($Size -ge 24) {
        $docW = 30 * $s
        $docH = 36 * $s
        $docX = $cx - ($docW / 2)
        $docY = $cy - ($docH / 2) + (2 * $s)
        $docRect = [System.Drawing.RectangleF]::new($docX, $docY, $docW, $docH)

        $docBrush = New-Object System.Drawing.SolidBrush $White
        $g.FillRectangle($docBrush, $docRect)

        if ($Size -ge 32) {
            $fold = 8 * $s
            $foldPoints = @(
                [System.Drawing.PointF]::new($docX + $docW - $fold, $docY),
                [System.Drawing.PointF]::new($docX + $docW, $docY + $fold),
                [System.Drawing.PointF]::new($docX + $docW - $fold, $docY + $fold)
            )
            $foldBrush = New-Object System.Drawing.SolidBrush $LightBlue
            $g.FillPolygon($foldBrush, $foldPoints)
            $foldBrush.Dispose()

            $linePen = New-DrawingPen -Color $PrimaryBlue -Width ([Math]::Max(1.5, 2 * $s))
            for ($line = 0; $line -lt 3; $line++) {
                $ly = $docY + (12 * $s) + ($line * 7 * $s)
                $g.DrawLine($linePen, $docX + (5 * $s), $ly, $docX + $docW - (6 * $s), $ly)
            }
            $linePen.Dispose()
        }

        $docBrush.Dispose()
    }

    $outlinePen.Dispose()
    $ringPen.Dispose()
    $g.Dispose()

    return $bmp
}

function Get-IconDibBytes {
    param([System.Drawing.Bitmap]$Bitmap)

    $size = $Bitmap.Width
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $data = $Bitmap.LockBits(
        $rect,
        [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    try {
        $stride = $data.Stride
        $buffer = New-Object byte[] ([Math]::Abs($stride) * $size)
        [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buffer, 0, $buffer.Length)

        $andRowBytes = [int][Math]::Ceiling($size / 32.0) * 4
        $andSize = $andRowBytes * $size

        $ms = New-Object System.IO.MemoryStream
        $bw = New-Object System.IO.BinaryWriter $ms

        $bw.Write([uint32]40)
        $bw.Write([int32]$size)
        $bw.Write([int32]($size * 2))
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]0)
        $bw.Write([int32]0)
        $bw.Write([int32]0)
        $bw.Write([uint32]0)
        $bw.Write([uint32]0)

        for ($y = $size - 1; $y -ge 0; $y--) {
            for ($x = 0; $x -lt $size; $x++) {
                $srcIndex = ($y * $stride) + ($x * 4)
                $bw.Write($buffer[$srcIndex])
                $bw.Write($buffer[$srcIndex + 1])
                $bw.Write($buffer[$srcIndex + 2])
                $bw.Write($buffer[$srcIndex + 3])
            }
        }

        for ($i = 0; $i -lt $andSize; $i++) {
            $bw.Write([byte]0)
        }

        $bw.Flush()
        return $ms.ToArray()
    }
    finally {
        $Bitmap.UnlockBits($data)
    }
}

function Save-ClassicIcon {
    param(
        [string]$Path,
        [int[]]$Sizes = @(256, 48, 32, 16)
    )

    $images = New-Object System.Collections.Generic.List[byte[]]

    foreach ($size in $Sizes) {
        $frame = New-DeskSearchBitmap -Size $size
        $images.Add((Get-IconDibBytes -Bitmap $frame)) | Out-Null
        $frame.Dispose()
    }

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter $ms

    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$Sizes.Count)

    $offset = 6 + (16 * $Sizes.Count)

    for ($i = 0; $i -lt $Sizes.Count; $i++) {
        $size = $Sizes[$i]
        $data = $images[$i]

        $entryW = if ($size -ge 256) { [byte]0 } else { [byte]$size }
        $entryH = if ($size -ge 256) { [byte]0 } else { [byte]$size }

        $bw.Write($entryW)
        $bw.Write($entryH)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$data.Length)
        $bw.Write([uint32]$offset)
        $offset += $data.Length
    }

    foreach ($data in $images) {
        $bw.Write($data)
    }

    $bw.Flush()
    [System.IO.File]::WriteAllBytes($Path, $ms.ToArray())
    $bw.Close()
    $ms.Close()
}

$bitmap = New-DeskSearchBitmap -Size 256
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Save-ClassicIcon -Path $icoPath
$bitmap.Dispose()

Write-Host "Created transparent icon:"
Write-Host "  $pngPath"
Write-Host "  $icoPath"
