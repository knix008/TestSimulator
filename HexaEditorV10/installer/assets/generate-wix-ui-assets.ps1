$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$assetDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconPath = Join-Path (Split-Path -Parent (Split-Path -Parent $assetDir)) "daemon_hammer.ico"

if (!(Test-Path -LiteralPath $iconPath)) {
    throw "Icon not found: $iconPath"
}

$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($iconPath)
if ($null -eq $icon) {
    $fs = [System.IO.File]::OpenRead($iconPath)
    try {
        $icon = New-Object System.Drawing.Icon($fs)
    }
    finally {
        $fs.Dispose()
    }
}

function New-Bmp {
    param(
        [string]$Path,
        [int]$Width,
        [int]$Height,
        [int]$IconSize,
        [int]$X,
        [int]$Y
    )

    $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.Clear([System.Drawing.Color]::FromArgb(245, 245, 245))
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawIcon($icon, (New-Object System.Drawing.Rectangle($X, $Y, $IconSize, $IconSize)))
        $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    }
    finally {
        $g.Dispose()
        $bmp.Dispose()
    }
}

New-Bmp -Path (Join-Path $assetDir "WixUIBannerBmp.bmp") -Width 493 -Height 58 -IconSize 40 -X 8 -Y 9
New-Bmp -Path (Join-Path $assetDir "WixUIDialogBmp.bmp") -Width 493 -Height 312 -IconSize 96 -X 24 -Y 108
