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
