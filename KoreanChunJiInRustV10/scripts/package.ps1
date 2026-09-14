# package.ps1 - 설치용 파일을 만든다. (Windows)
#
#   .\scripts\package.ps1
#   .\scripts\package.ps1 -SkipTest
#   .\scripts\package.ps1 -SkipWeb
#
# 하는 일
#   1. 시험을 돌린다 (-SkipTest 면 건너뛴다)
#   2. 앱과 서버를 빌드한다                 -> chunjiin.exe · chunjiin-serve.exe
#   3. 웹 판을 만든다 (-SkipWeb 면 건너뛴다)
#   4. 앱을 설치 프로그램 안에 넣는다
#   5. 설치 프로그램을 빌드한다             -> chunjiin-setup.exe
#   6. 배포용 묶음을 만든다                 -> chunjiin-<판>-windows-x64.zip
#   7. 모두 저장소 루트에 둔다
#
# 다른 설치 도구(Inno Setup, NSIS)를 필요로 하지 않는다.
# Rust 로 짜인 GUI 설치기가 실행 파일을 자기 안에 품는다.

[CmdletBinding()]
param(
    [switch]$SkipTest,
    [switch]$SkipWeb,
    [string]$Version = '1.0'
)

$ErrorActionPreference = 'Stop'
# 콘솔이 한글을 깨뜨리지 않게 UTF-8 로 맞춘다.
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
& "$root\scripts\prereq.ps1"
. "$root\scripts\cargo-out.ps1"

Write-Host "== 천지인 설치용 파일 만들기  $Version  (windows/x64)" -ForegroundColor Cyan

if (-not $SkipTest) {
    Write-Host '-- 시험' -ForegroundColor Cyan
    cargo run -q -p chunjiin-testreport
    if ($LASTEXITCODE -ne 0) { throw '시험이 실패했다. 설치용 파일을 만들지 않는다.' }
}

if (-not $SkipWeb) {
    Write-Host '-- 웹 판' -ForegroundColor Cyan
    & "$root\scripts\build-web.ps1"
    if ($LASTEXITCODE -ne 0) { throw '웹 판 빌드 실패' }
}

Write-Host '-- 앱 · 서버 빌드' -ForegroundColor Cyan
# 웹 판을 먼저 만들었으므로 서버가 그것을 품는다.
cargo build --release -p chunjiin-app -p chunjiin-serve
if ($LASTEXITCODE -ne 0) { throw '앱 빌드 실패' }
Copy-CargoBinTo -Name 'chunjiin.exe' -DestDir $root -Profile 'release'
Copy-CargoBinTo -Name 'chunjiin-serve.exe' -DestDir $root -Profile 'release'

Write-Host '-- 설치 프로그램 빌드' -ForegroundColor Cyan
Build-ChunjiinSetup -Root $root -Profile 'release' -CargoArgs @('build', '--release')

Write-Host '-- 배포용 묶음' -ForegroundColor Cyan
$stage = Join-Path $env:TEMP "chunjiin-pkg-$PID"
$zip = Join-Path $root "chunjiin-$Version-windows-x64.zip"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item (Join-Path $root 'chunjiin.exe') $stage
Copy-Item (Join-Path $root 'chunjiin-setup.exe') $stage
Copy-Item (Join-Path $root 'chunjiin-serve.exe') $stage
foreach ($doc in @('README.md', 'UsersGuide.md')) {
    Copy-Item (Join-Path $root $doc) $stage -ErrorAction SilentlyContinue
}

Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "$stage\*" -DestinationPath $zip
Remove-Item $stage -Recurse -Force

Write-Host '== 만든 것' -ForegroundColor Green
foreach ($name in @('chunjiin.exe', 'chunjiin-setup.exe', 'chunjiin-serve.exe',
                    "chunjiin-$Version-windows-x64.zip")) {
    $f = Join-Path $root $name
    if (Test-Path $f) {
        $mb = [math]::Round((Get-Item $f).Length / 1MB, 1)
        Write-Host ("   {0,-38} {1} MB" -f $name, $mb) -ForegroundColor Green
    }
}
