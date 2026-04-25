# daemon_hammer.ico 생성 스크립트
# .NET을 사용하여 간단한 아이콘 파일 생성

Add-Type -AssemblyName System.Drawing

# 여러 크기의 아이콘 생성 (16x16, 32x32, 48x48, 256x256)
$sizes = @(16, 32, 48, 256)
$bitmaps = @()

foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # 배경 (어두운 원)
    $darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 45, 48))
    $graphics.FillEllipse($darkBrush, 0, 0, $size, $size)
    
    # 테두리
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(0, 122, 204), [Math]::Max(1, $size / 32))
    $graphics.DrawEllipse($borderPen, 1, 1, $size - 2, $size - 2)
    
    # 망치 그리기 (간단한 형태)
    $hammerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $hammerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [Math]::Max(2, $size / 16))
    
    # 망치 손잡이
    $handleX = $size * 0.35
    $handleY1 = $size * 0.6
    $handleY2 = $size * 0.85
    $graphics.DrawLine($hammerPen, $handleX, $handleY1, $handleX, $handleY2)
    
    # 망치 헤드
    $headWidth = $size * 0.4
    $headHeight = $size * 0.25
    $headX = $handleX - $headWidth / 2
    $headY = $handleY1 - $headHeight
    $graphics.FillRectangle($hammerBrush, $headX, $headY, $headWidth, $headHeight)
    
    # 강조 효과
    $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 0, 122, 204))
    $graphics.FillEllipse($accentBrush, $size * 0.1, $size * 0.1, $size * 0.3, $size * 0.3)
    
    $graphics.Dispose()
    $darkBrush.Dispose()
    $borderPen.Dispose()
    $hammerBrush.Dispose()
    $hammerPen.Dispose()
    $accentBrush.Dispose()
    
    $bitmaps += $bitmap
}

# ICO 파일로 저장
$outputPath = Join-Path $PSScriptRoot "RTSPServer\daemon_hammer.ico"

# Icon 생성
$iconStream = New-Object System.IO.MemoryStream
$iconWriter = New-Object System.IO.BinaryWriter($iconStream)

# ICO 헤더
$iconWriter.Write([UInt16]0)  # Reserved
$iconWriter.Write([UInt16]1)  # Type (1 = ICO)
$iconWriter.Write([UInt16]$bitmaps.Count)  # Image count

$imageOffset = 6 + ($bitmaps.Count * 16)

# 각 이미지의 디렉토리 엔트리
foreach ($bitmap in $bitmaps) {
    $pngStream = New-Object System.IO.MemoryStream
    $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngStream.ToArray()
    
    $width = $bitmap.Width
    if ($width -eq 256) { $width = 0 }  # 256은 0으로 표현
    
    $iconWriter.Write([Byte]$width)  # Width
    $iconWriter.Write([Byte]$width)  # Height
    $iconWriter.Write([Byte]0)       # Color palette
    $iconWriter.Write([Byte]0)       # Reserved
    $iconWriter.Write([UInt16]1)     # Color planes
    $iconWriter.Write([UInt16]32)    # Bits per pixel
    $iconWriter.Write([UInt32]$pngBytes.Length)  # Size
    $iconWriter.Write([UInt32]$imageOffset)      # Offset
    
    $imageOffset += $pngBytes.Length
    $pngStream.Dispose()
}

# 각 이미지 데이터
foreach ($bitmap in $bitmaps) {
    $pngStream = New-Object System.IO.MemoryStream
    $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngStream.ToArray()
    $iconWriter.Write($pngBytes)
    $pngStream.Dispose()
}

# 파일로 저장
$iconBytes = $iconStream.ToArray()
[System.IO.File]::WriteAllBytes($outputPath, $iconBytes)

$iconWriter.Dispose()
$iconStream.Dispose()

foreach ($bitmap in $bitmaps) {
    $bitmap.Dispose()
}

Write-Host "아이콘 생성 완료: $outputPath" -ForegroundColor Green
