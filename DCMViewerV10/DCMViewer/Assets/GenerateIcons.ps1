# Generates AppIcon.ico and DcmFile.ico for DCMViewer.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public static class IconWriter
{
    public static void Save(string path, IList<Bitmap> bitmaps)
    {
        using (var stream = File.Create(path))
        using (var writer = new BinaryWriter(stream))
        {
            writer.Write((short)0);
            writer.Write((short)1);
            writer.Write((short)bitmaps.Count);

            var offset = 6 + (16 * bitmaps.Count);
            var pngData = new List<byte[]>(bitmaps.Count);

            foreach (var bitmap in bitmaps)
            {
                byte[] png;
                using (var pngStream = new MemoryStream())
                {
                    bitmap.Save(pngStream, ImageFormat.Png);
                    png = pngStream.ToArray();
                }
                pngData.Add(png);

                int size = bitmap.Width;
                writer.Write((byte)(size >= 256 ? 0 : size));
                writer.Write((byte)(size >= 256 ? 0 : size));
                writer.Write((byte)0);
                writer.Write((byte)0);
                writer.Write((short)1);
                writer.Write((short)32);
                writer.Write(png.Length);
                writer.Write(offset);
                offset += png.Length;
            }

            foreach (var png in pngData)
                writer.Write(png);
        }
    }
}
"@

function New-AppIconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::FromArgb(255, 24, 78, 140))

    $margin = [Math]::Max(2, [int]($size * 0.1))
    $body = New-Object System.Drawing.Rectangle $margin, $margin, ($size - 2 * $margin), ($size - 2 * $margin)
    $bodyBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 236, 244, 255))
    $g.FillRectangle($bodyBrush, $body)
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 16, 56, 110)), ([single]([Math]::Max(1, $size / 16.0)))
    $g.DrawRectangle($borderPen, $body)

    $crossBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 210, 55, 55))
    $thick = [Math]::Max(2, [int]($size / 7))
    $arm = [int]($size * 0.17)
    $cx = [int]($size / 2)
    $cy = [int]($size / 2)
    $g.FillRectangle($crossBrush, ($cx - $arm), ($cy - [int]($thick / 2)), (2 * $arm), $thick)
    $g.FillRectangle($crossBrush, ($cx - [int]($thick / 2)), ($cy - $arm), $thick, (2 * $arm))

    if ($size -ge 32) {
        $fontSize = [Math]::Max(6.0, $size * 0.16)
        $font = New-Object System.Drawing.Font "Segoe UI", $fontSize, ([System.Drawing.FontStyle]::Bold)
        $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 24, 78, 140))
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $format.LineAlignment = [System.Drawing.StringAlignment]::Far
        $layout = New-Object System.Drawing.RectangleF 0, 0, $size, ($size - $margin)
        $g.DrawString("DCM", $font, $textBrush, $layout, $format)
        $font.Dispose(); $textBrush.Dispose(); $format.Dispose()
    }

    $bodyBrush.Dispose(); $borderPen.Dispose(); $crossBrush.Dispose(); $g.Dispose()
    return $bmp
}

function New-DcmFileIconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(1, [int]($size * 0.06))
    $docW = [int]($size * 0.62)
    $docH = [int]($size * 0.78)
    $docX = [int](($size - $docW) / 2)
    $docY = [int]($size * 0.08)
    $fold = [Math]::Max(3, [int]($size * 0.14))

    $docRect = New-Object System.Drawing.Rectangle $docX, $docY, $docW, $docH
    $pageBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 252, 252, 254))
    $g.FillRectangle($pageBrush, $docRect)
    $pagePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 150, 160, 175)), ([single]([Math]::Max(1, $size / 32.0)))
    $g.DrawRectangle($pagePen, $docRect)

    $foldPoints = @(
        [System.Drawing.Point]::new($docX + $docW - $fold, $docY),
        [System.Drawing.Point]::new($docX + $docW, $docY + $fold),
        [System.Drawing.Point]::new($docX + $docW - $fold, $docY + $fold)
    )
    $foldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 220, 225, 232))
    $g.FillPolygon($foldBrush, $foldPoints)
    $g.DrawPolygon($pagePen, $foldPoints)

    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 205, 212, 222)), ([single]([Math]::Max(1, $size / 48.0)))
    $lineLeft = $docX + [int]($docW * 0.14)
    $lineRight = $docX + $docW - [int]($docW * 0.14)
    $lineY1 = $docY + [int]($docH * 0.22)
    $lineY2 = $docY + [int]($docH * 0.34)
    $lineY3 = $docY + [int]($docH * 0.46)
    $g.DrawLine($linePen, $lineLeft, $lineY1, $lineRight, $lineY1)
    $g.DrawLine($linePen, $lineLeft, $lineY2, $lineRight, $lineY2)
    $g.DrawLine($linePen, $lineLeft, $lineY3, $lineRight - [int]($docW * 0.18), $lineY3)

    $imageRect = New-Object System.Drawing.Rectangle ($docX + [int]($docW * 0.14)), ($docY + [int]($docH * 0.52)), ([int]($docW * 0.72)), ([int]($docH * 0.28))
    $imageBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 228, 236, 248))
    $g.FillRectangle($imageBrush, $imageRect)
    $imagePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 70, 120, 190)), ([single]([Math]::Max(1, $size / 40.0)))
    $g.DrawRectangle($imagePen, $imageRect)

    $crossBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 220, 70, 70))
    $thick = [Math]::Max(1, [int]($size / 14))
    $arm = [Math]::Max(2, [int]($size * 0.07))
    $cx = $imageRect.X + [int]($imageRect.Width / 2)
    $cy = $imageRect.Y + [int]($imageRect.Height / 2)
    $g.FillRectangle($crossBrush, ($cx - $arm), ($cy - [int]($thick / 2)), (2 * $arm), $thick)
    $g.FillRectangle($crossBrush, ($cx - [int]($thick / 2)), ($cy - $arm), $thick, (2 * $arm))

    $badgeH = [Math]::Max(4, [int]($size * 0.18))
    $badgeY = $docY + $docH - [int]($badgeH * 0.55)
    $badgeRect = New-Object System.Drawing.Rectangle ($docX - [int]($size * 0.04)), $badgeY, ($docW + [int]($size * 0.08)), $badgeH
    $badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $badgeRect,
        [System.Drawing.Color]::FromArgb(255, 18, 96, 176),
        [System.Drawing.Color]::FromArgb(255, 36, 132, 210),
        0.0)
    $g.FillRectangle($badgeBrush, $badgeRect)
    $badgePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 12, 72, 140)), ([single]([Math]::Max(1, $size / 48.0)))
    $g.DrawRectangle($badgePen, $badgeRect)

    if ($size -ge 16) {
        $fontSize = [Math]::Max(5.0, $size * 0.13)
        $font = New-Object System.Drawing.Font "Segoe UI", $fontSize, ([System.Drawing.FontStyle]::Bold)
        $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $format.LineAlignment = [System.Drawing.StringAlignment]::Center
        $g.DrawString(".dcm", $font, $textBrush, [System.Drawing.RectangleF]$badgeRect, $format)
        $font.Dispose(); $textBrush.Dispose(); $format.Dispose()
    }

    $pageBrush.Dispose(); $pagePen.Dispose(); $foldBrush.Dispose(); $linePen.Dispose()
    $imageBrush.Dispose(); $imagePen.Dispose(); $crossBrush.Dispose(); $badgeBrush.Dispose(); $badgePen.Dispose()
    $g.Dispose()
    return $bmp
}

function Save-MultiSizeIcon([string]$path, [scriptblock]$factory) {
    $sizes = @(16, 32, 48, 256)
    $bitmaps = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
    foreach ($size in $sizes) {
        [void]$bitmaps.Add((& $factory $size))
    }

    [IconWriter]::Save($path, $bitmaps)

    foreach ($bitmap in $bitmaps) {
        $bitmap.Dispose()
    }
}

$assetsDir = $PSScriptRoot
Save-MultiSizeIcon (Join-Path $assetsDir "AppIcon.ico") ${function:New-AppIconBitmap}
Save-MultiSizeIcon (Join-Path $assetsDir "DcmFile.ico") ${function:New-DcmFileIconBitmap}
Write-Host "Generated AppIcon.ico and DcmFile.ico in $assetsDir"
