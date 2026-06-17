function Save-MultiSizeIcon {
    param(
        [string]$Path,
        [int[]]$Sizes,
        [scriptblock]$DrawBitmap
    )

    $sortedSizes = $Sizes | Sort-Object -Descending
    $images = New-Object System.Collections.Generic.List[System.Drawing.Image]
    try {
        foreach ($size in $sortedSizes) {
            $bmp = & $DrawBitmap $size
            [void]$images.Add($bmp)
        }

        $ms = New-Object System.IO.MemoryStream
        $bw = New-Object System.IO.BinaryWriter $ms
        try {
            $bw.Write([UInt16]0)
            $bw.Write([UInt16]1)
            $bw.Write([UInt16]$images.Count)

            $offset = 6 + (16 * $images.Count)
            $pngChunks = New-Object System.Collections.Generic.List[byte[]]

            foreach ($img in $images) {
                $pngMs = New-Object System.IO.MemoryStream
                try {
                    $img.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)
                    [void]$pngChunks.Add($pngMs.ToArray())
                }
                finally { $pngMs.Dispose() }
            }

            for ($i = 0; $i -lt $images.Count; $i++) {
                $img = $images[$i]
                $png = $pngChunks[$i]
                $w = $img.Width
                $h = $img.Height
                $entryW = if ($w -ge 256) { 0 } else { $w }
                $entryH = if ($h -ge 256) { 0 } else { $h }
                $bw.Write([byte]$entryW)
                $bw.Write([byte]$entryH)
                $bw.Write([byte]0)
                $bw.Write([byte]0)
                $bw.Write([UInt16]1)
                $bw.Write([UInt16]0)
                $bw.Write([UInt32]$png.Length)
                $bw.Write([UInt32]$offset)
                $offset += $png.Length
            }

            foreach ($png in $pngChunks) { $bw.Write($png) }
            [System.IO.File]::WriteAllBytes($Path, $ms.ToArray())
        }
        finally {
            $bw.Dispose()
            $ms.Dispose()
        }
    }
    finally {
        foreach ($img in $images) { $img.Dispose() }
    }
}

function New-Graphics([System.Drawing.Bitmap]$bmp) {
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    return $g
}

function Scale-Bitmap([System.Drawing.Image]$source, [int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = New-Graphics $bmp
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($source, 0, 0, $size, $size)
    $g.Dispose()
    return $bmp
}

function Draw-DbTable(
    [System.Drawing.Graphics]$g,
    [System.Drawing.RectangleF]$rect,
    [System.Drawing.Color]$headerColor,
    [System.Drawing.Color]$borderColor,
    [float]$scale,
    [int]$rowCount = 3) {

    $headerH = [Math]::Max(4.0, 10.0 * $scale)
    $headerRect = New-Object System.Drawing.RectangleF $rect.X, $rect.Y, $rect.Width, $headerH
    $bodyRect = New-Object System.Drawing.RectangleF $rect.X, ($rect.Y + $headerH), $rect.Width, ($rect.Height - $headerH)

    $headerBrush = New-Object System.Drawing.SolidBrush $headerColor
    $bodyBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $borderPen = New-Object System.Drawing.Pen $borderColor, ([Math]::Max(1.0, 1.8 * $scale))
    $g.FillRectangle($headerBrush, $headerRect)
    $g.FillRectangle($bodyBrush, $bodyRect)
    $g.DrawRectangle($borderPen, $rect.X, $rect.Y, $rect.Width, $rect.Height)

    if ($rect.Height -ge 18 * $scale) {
        $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(210, 203, 213, 225)), 1
        $rowStep = ($bodyRect.Height - 2) / [Math]::Max(1, $rowCount)
        for ($i = 1; $i -le $rowCount; $i++) {
            $y = $bodyRect.Y + $i * $rowStep
            $g.DrawLine($linePen, ($bodyRect.X + 2), $y, ($bodyRect.Right - 2), $y)
        }
        $linePen.Dispose()
    }

    $headerBrush.Dispose()
    $bodyBrush.Dispose()
    $borderPen.Dispose()
}
