# package.ps1 - 설치용 파일을 만든다. (Windows)
#
#   .\scripts\package.ps1
#   .\scripts\package.ps1 -SkipTest
#   .\scripts\package.ps1 -Version 1.0
#
# 하는 일
#   1. 시험을 돌린다
#   2. 앱과 서버를 한 파일로 빌드한다       -> dist\chunjiin.exe · dist\chunjiin-serve.exe
#   3. 그 앱을 설치 프로그램 안에 넣는다
#   4. 설치 프로그램을 한 파일로 빌드한다   -> chunjiin-setup.exe (루트에 이것 하나만)
#   5. 배포용 묶음을 만든다                 -> chunjiin-<판>-windows-x64.zip
#
# WiX 나 Inno Setup 같은 다른 설치 도구가 필요 없다.
# 파이썬으로 짜인 GUI 설치기가 앱을 자기 안에 품는다.
# PySide6 과 PyInstaller 는 없으면 pip 으로 저절로 넣는다 (scripts\ensure_deps.py).

[CmdletBinding()]
param(
    [switch]$SkipTest,
    [string]$Version = '1.0'
)

# PowerShell 5.1 은 네이티브 exe 가 stderr 로 찍은 줄을 오류로 잘못 읽는다.
# ErrorActionPreference 를 Stop 으로 두면 PyInstaller 가 진행 상황을 찍는
# 것만으로 스크립트가 멈춘다. 그래서 Continue 로 두고, 성공 여부는 언제나
# $LASTEXITCODE 로 직접 본다.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

# 있는 것을 찾는 것으로는 모자라다. Windows 의 python3 은 스토어로 데려가는
# 껍데기일 때가 있어서, 부르면 아무것도 하지 않고 끝난다. 그래서 정말로
# 도는지, 3.10 이상인지 실제로 물어 본다.
$check = 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'
$python = $null
foreach ($name in @('python', 'py', 'python3')) {
    $found = (Get-Command $name -ErrorAction SilentlyContinue).Source
    if (-not $found) { continue }
    & $found -c $check *> $null
    if ($LASTEXITCODE -eq 0) { $python = $found; break }
}
if (-not $python) {
    Write-Host '파이썬 3.10 이상을 찾지 못했습니다.' -ForegroundColor Red
    exit 1
}

$arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
Write-Host "== 천지인 설치용 파일 만들기  $Version  (windows/$arch)"

& $python scripts\ensure_deps.py desktop build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipTest) {
    Write-Host '-- 시험'
    # 창을 띄우지 않고 그린다. 이 스크립트는 지금 PowerShell 프로세스 안에서
    # 돌므로, 끝나면 반드시 되돌려 세션에 남기지 않는다.
    $hadPlatform = Test-Path Env:\QT_QPA_PLATFORM
    $oldPlatform = if ($hadPlatform) { $env:QT_QPA_PLATFORM } else { $null }
    $env:QT_QPA_PLATFORM = 'offscreen'
    try {
        & $python -m tests.report
        $testCode = $LASTEXITCODE
    } finally {
        if ($hadPlatform) {
            $env:QT_QPA_PLATFORM = $oldPlatform
        } else {
            Remove-Item Env:\QT_QPA_PLATFORM -ErrorAction SilentlyContinue
        }
    }
    if ($testCode -ne 0) {
        Write-Host '시험이 통과하지 못했습니다.' -ForegroundColor Red
        exit 1
    }
}

Write-Host '-- 앱 · 서버 · 설치 프로그램 빌드'
# 셋 다 한 파일로 만들되 루트에는 설치 프로그램만 놓는다. 설치 프로그램은
# 앞서 만든 앱을 자기 안에 품으므로 차례가 중요하다. pyinstaller_build.py 가 지킨다.
& $python scripts\pyinstaller_build.py --clean --copy-root --targets app serve setup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '-- 배포용 묶음'
$zip = Join-Path $root "chunjiin-$Version-windows-$arch.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

$stage = Join-Path ([System.IO.Path]::GetTempPath()) "chunjiin-pkg-$([guid]::NewGuid())"
$pkg = Join-Path $stage "chunjiin-$Version"
New-Item -ItemType Directory -Path $pkg -Force | Out-Null
# 앱과 서버는 dist\ 에, 설치 프로그램은 루트에 있다.
foreach ($file in @(
    (Join-Path $root 'dist\chunjiin.exe'),
    (Join-Path $root 'dist\chunjiin-serve.exe'),
    (Join-Path $root 'chunjiin-setup.exe')
)) {
    if (Test-Path -LiteralPath $file) {
        Copy-Item -LiteralPath $file -Destination $pkg -Force
    }
}
foreach ($doc in @('README.md', 'UsersGuide.md')) {
    if (Test-Path -LiteralPath (Join-Path $root $doc)) {
        Copy-Item -LiteralPath (Join-Path $root $doc) -Destination $pkg -Force
    }
}
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Remove-Item -LiteralPath $stage -Recurse -Force

Write-Host '== 만든 것'
$made = @(
    'dist\chunjiin.exe',
    'dist\chunjiin-serve.exe',
    'chunjiin-setup.exe',
    "chunjiin-$Version-windows-$arch.zip"
)
foreach ($f in $made) {
    $path = Join-Path $root $f
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $item = Get-Item -LiteralPath $path
    if ($item.PSIsContainer) {
        $bytes = (Get-ChildItem -LiteralPath $path -Recurse -File | Measure-Object -Property Length -Sum).Sum
    } else {
        $bytes = $item.Length
    }
    Write-Host ('   {0,-38} {1}' -f $f, ('{0:N1} MB' -f ($bytes / 1MB)))
}
