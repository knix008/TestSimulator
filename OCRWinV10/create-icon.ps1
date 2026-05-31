Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 64, 256)
$pngData = @()

foreach ($size in $sizes) {
    $bmp = [System.Drawing.Bitmap]::new($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Rounded rectangle background (deep blue)
    $radius = [int]([Math]::Max(2, $size * 0.18))
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc(0, 0, $radius*2, $radius*2, 180, 90)
    $path.AddArc($size - $radius*2, 0, $radius*2, $radius*2, 270, 90)
    $path.AddArc($size - $radius*2, $size - $radius*2, $radius*2, $radius*2, 0, 90)
    $path.AddArc(0, $size - $radius*2, $radius*2, $radius*2, 90, 90)
    $path.CloseFigure()
    $bgBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25, 95, 180))
    $g.FillPath($bgBrush, $path)

    # White Korean character
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $fontSize = [float][Math]::Max(6, $size * 0.55)
    $style = [System.Drawing.FontStyle]::Bold
    $font = [System.Drawing.Font]::new("Malgun Gothic", $fontSize, $style)
    $sf = [System.Drawing.StringFormat]::new()
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = [System.Drawing.RectangleF]::new(0, 0, $size, $size)
    $g.DrawString([char]44032, $font, $textBrush, $rect, $sf)  # U+AC00 = 가

    $g.Dispose(); $font.Dispose(); $bgBrush.Dispose(); $textBrush.Dispose()
    $path.Dispose(); $sf.Dispose()

    $ms = [System.IO.MemoryStream]::new()
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngData += , $ms.ToArray()
    $ms.Dispose()
}

# Assemble ICO file
$out = [System.IO.MemoryStream]::new()
$bw = [System.IO.BinaryWriter]::new($out)

$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$pngData.Count)

$offset = [uint32](6 + 16 * $pngData.Count)
for ($i = 0; $i -lt $pngData.Count; $i++) {
    $w = if ($sizes[$i] -eq 256) { [byte]0 } else { [byte]$sizes[$i] }
    $h = if ($sizes[$i] -eq 256) { [byte]0 } else { [byte]$sizes[$i] }
    $bw.Write($w); $bw.Write($h)
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$pngData[$i].Length)
    $bw.Write($offset)
    $offset += [uint32]$pngData[$i].Length
}
foreach ($data in $pngData) { $bw.Write($data) }
$bw.Flush()

$outPath = Join-Path $PSScriptRoot "OCRWinV10\app.ico"
[System.IO.File]::WriteAllBytes($outPath, $out.ToArray())
Write-Host "Created: $outPath ($($out.Length) bytes)"
$bw.Dispose(); $out.Dispose()
