# Downloads FFmpeg essentials (win64) into tools\ for ScreenCamWin merge.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $root 'tools'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

$zip = Join-Path $env:TEMP 'ffmpeg-essentials.zip'
$urls = @(
    'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-7.1.1-essentials_build.zip',
    'https://github.com/GyanD/codexffmpeg/releases/download/7.1.1/ffmpeg-7.1.1-essentials_build.zip'
)

foreach ($url in $urls) {
    try {
        Write-Host "Downloading: $url"
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 300
        break
    } catch {
        Write-Warning $_
    }
}

if (-not (Test-Path $zip)) {
    throw 'FFmpeg download failed. Check network or download manually from https://www.gyan.dev/ffmpeg/builds/'
}

$extract = Join-Path $env:TEMP 'ffmpeg-essentials-extract'
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract -Force

$bin = Get-ChildItem -Path $extract -Recurse -Directory -Filter 'bin' | Select-Object -First 1
if (-not $bin) { throw 'bin folder not found in FFmpeg archive' }

Copy-Item (Join-Path $bin.FullName 'ffmpeg.exe') (Join-Path $toolsDir 'ffmpeg.exe') -Force
if (Test-Path (Join-Path $bin.FullName 'ffprobe.exe')) {
    Copy-Item (Join-Path $bin.FullName 'ffprobe.exe') (Join-Path $toolsDir 'ffprobe.exe') -Force
}

Remove-Item $zip -Force -ErrorAction SilentlyContinue
Get-ChildItem $toolsDir -Filter '*.exe' | Format-Table Name, @{ N = 'MB'; E = { [math]::Round($_.Length / 1MB, 1) } }
Write-Host 'Done. Rebuild ScreenCamWin.'
