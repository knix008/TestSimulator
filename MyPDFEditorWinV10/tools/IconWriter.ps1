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

function Add-RoundedRectPath(
    [System.Drawing.Drawing2D.GraphicsPath]$path,
    [System.Drawing.RectangleF]$rect,
    [float]$radius) {

    $r = [Math]::Min($radius, [Math]::Min($rect.Width, $rect.Height) / 2.0)
    if ($r -le 0.5) {
        $path.AddRectangle($rect)
        return
    }

    $d = 2.0 * $r
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()
}

function New-RoundedRectPath([System.Drawing.RectangleF]$rect, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-RoundedRectPath $path $rect $radius
    return $path
}

function Fill-RoundedRect(
    [System.Drawing.Graphics]$g,
    [System.Drawing.Brush]$brush,
    [System.Drawing.RectangleF]$rect,
    [float]$radius) {

    $path = New-RoundedRectPath $rect $radius
    try { $g.FillPath($brush, $path) }
    finally { $path.Dispose() }
}

function Draw-RoundedRect(
    [System.Drawing.Graphics]$g,
    [System.Drawing.Pen]$pen,
    [System.Drawing.RectangleF]$rect,
    [float]$radius) {

    $path = New-RoundedRectPath $rect $radius
    try { $g.DrawPath($pen, $path) }
    finally { $path.Dispose() }
}

function Draw-SoftShadow(
    [System.Drawing.Graphics]$g,
    [System.Drawing.RectangleF]$rect,
    [float]$radius,
    [float]$scale,
    [int]$alpha = 48,
    [float]$offsetY = 6.0) {

    $shadowRect = New-Object System.Drawing.RectangleF ($rect.X), ($rect.Y + $offsetY * $scale), $rect.Width, $rect.Height
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, 15, 23, 42))
    Fill-RoundedRect $g $shadowBrush $shadowRect ($radius * $scale)
    $shadowBrush.Dispose()
}

