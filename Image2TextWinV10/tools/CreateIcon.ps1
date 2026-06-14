Add-Type -AssemblyName System.Drawing

function Draw-IconAt {
    param([int]$size)

    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 18, 26, 48))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)
    $bgBrush.Dispose()

    $s = [float]$size / 16.0

    $frameColor = [System.Drawing.Color]::FromArgb(255, 100, 175, 255)
    $framePen = New-Object System.Drawing.Pen($frameColor, [Math]::Max(1.0, $s * 0.65))
    $fx = [int]($s * 0.8)
    $fy = [int]($s * 1.5)
    $fw = [int]($s * 5.5)
    $fh = [int]($s * 8.0)
    $g.DrawRectangle($framePen, $fx, $fy, $fw, $fh)
    $framePen.Dispose()

    $skyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 70, 130, 200))
    $g.FillRectangle($skyBrush, ($fx + 1), ($fy + 1), ($fw - 2), [int]($fh * 0.5))
    $skyBrush.Dispose()

    $p1 = New-Object System.Drawing.PointF(([float]($fx + $s * 0.3)), ([float]($fy + $fh - 1)))
    $p2 = New-Object System.Drawing.PointF(([float]($fx + $fw * 0.5)), ([float]($fy + $fh * 0.3)))
    $p3 = New-Object System.Drawing.PointF(([float]($fx + $fw - 1)), ([float]($fy + $fh - 1)))
    $pts = [System.Drawing.PointF[]]@($p1, $p2, $p3)
    $mtnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 60, 150, 80))
    $g.FillPolygon($mtnBrush, $pts)
    $mtnBrush.Dispose()

    $arrowSize = [Math]::Max(5.0, $s * 2.0)
    $arrowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 200, 0))
    $arrowFont = New-Object System.Drawing.Font("Segoe UI", $arrowSize, [System.Drawing.FontStyle]::Bold)
    $arrowChar = [char]0x2192
    $g.DrawString($arrowChar, $arrowFont, $arrowBrush, ([float]($s * 6.4)), ([float]($s * 4.8)))
    $arrowFont.Dispose()
    $arrowBrush.Dispose()

    $lineColor = [System.Drawing.Color]::FromArgb(255, 210, 235, 255)
    $lineBrush = New-Object System.Drawing.SolidBrush($lineColor)
    $lineX = [float]($s * 9.2)
    $lineHt = [float]([Math]::Max(1.0, $s * 0.7))
    $lengths = @(4.0, 3.2, 3.8, 2.8, 3.4)
    for ($i = 0; $i -lt 5; $i++) {
        $lw = [float]($s * $lengths[$i])
        $ly = [float]($s * (2.2 + $i * 2.1))
        $g.FillRectangle($lineBrush, $lineX, $ly, $lw, $lineHt)
    }
    $lineBrush.Dispose()
    $g.Dispose()

    return $bmp
}

function Write-IcoFile {
    param([string]$outPath)

    $sizes = @(256, 64, 48, 32, 16)
    $pngData = @{}

    foreach ($sz in $sizes) {
        $bmp = Draw-IconAt -size $sz
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngData[$sz] = $ms.ToArray()
        $ms.Dispose()
        $bmp.Dispose()
    }

    $fs = New-Object System.IO.FileStream($outPath, [System.IO.FileMode]::Create)
    $writer = New-Object System.IO.BinaryWriter($fs)

    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)

    $baseOffset = 6 + 16 * $sizes.Count
    $offset = $baseOffset
    $offsetList = New-Object System.Collections.Generic.List[int]
    foreach ($sz in $sizes) {
        $offsetList.Add($offset)
        $offset += $pngData[$sz].Length
    }

    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $sz = $sizes[$i]
        $imgData = $pngData[$sz]
        $w = if ($sz -eq 256) { [byte]0 } else { [byte]$sz }
        $h = if ($sz -eq 256) { [byte]0 } else { [byte]$sz }
        $writer.Write($w)
        $writer.Write($h)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$imgData.Length)
        $writer.Write([uint32]$offsetList[$i])
    }

    foreach ($sz in $sizes) {
        $writer.Write($pngData[$sz])
    }

    $writer.Close()
    $fs.Close()
    Write-Host "Icon created: $outPath"
}

$iconPath = "d:\Home\Projects\TestSimulator\Image2TextWinV10\Image2TextWin\AppIcon.ico"
Write-IcoFile -outPath $iconPath
