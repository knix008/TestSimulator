# package.ps1 - 설치용 파일을 만든다. (Windows)
#
#   .\scripts\package.ps1
#
# 하는 일
#   1. 시험을 돌린다 (-SkipTest 면 건너뛴다)
#   2. Windows 아이콘 리소스를 만든다
#   3. 앱을 빌드한다                        -> chunjiin.exe
#   4. 그 실행 파일을 설치 프로그램 안에 넣는다
#   5. 설치 프로그램을 빌드한다             -> chunjiin-setup.exe
#   6. 둘 다 저장소 루트에 둔다
#
# 설치 프로그램은 다른 도구(Inno Setup, NSIS)를 필요로 하지 않는다.
# Go 로 짜인 GUI 설치기가 실행 파일을 자기 안에 품는다.

[CmdletBinding()]
param(
    [switch]$SkipTest,
    [string]$Version = '1.0'
)

$ErrorActionPreference = 'Stop'
# 콘솔이 한글을 깨뜨리지 않게 UTF-8 로 맞춘다.
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$payload = Join-Path $root 'cmd\chunjiin-setup\payload'
$ldApp = "-s -w -X github.com/knix008/chunjiin/internal/ui.Version=$Version"
$ldSetup = "-s -w -X main.Version=$Version"

Write-Host "== 천지인 설치용 파일 만들기  $Version" -ForegroundColor Cyan

if (-not $SkipTest) {
    Write-Host '-- 시험' -ForegroundColor Cyan
    go test ./...
    if ($LASTEXITCODE -ne 0) { throw '시험이 실패했다. 설치용 파일을 만들지 않는다.' }
}

Write-Host '-- Windows 아이콘' -ForegroundColor Cyan
& "$root\scripts\embed-win-icon.ps1" -Version $Version
if ($LASTEXITCODE -ne 0) { throw '아이콘 리소스 만들기 실패' }

Write-Host '-- 앱 빌드' -ForegroundColor Cyan
go build -ldflags "-H windowsgui $ldApp" -o chunjiin.exe ./cmd/chunjiin
if ($LASTEXITCODE -ne 0) { throw '앱 빌드 실패' }

Write-Host '-- 설치 프로그램에 넣기' -ForegroundColor Cyan
Get-ChildItem $payload -Filter 'chunjiin*' -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item chunjiin.exe (Join-Path $payload 'chunjiin.exe') -Force

try {
    Write-Host '-- 설치 프로그램 빌드' -ForegroundColor Cyan
    go build -ldflags "-H windowsgui $ldSetup" -o chunjiin-setup.exe ./cmd/chunjiin-setup
    if ($LASTEXITCODE -ne 0) { throw '설치 프로그램 빌드 실패' }
}
finally {
    # 품고 있던 실행 파일은 저장소에 남기지 않는다.
    Get-ChildItem $payload -Filter 'chunjiin*' -ErrorAction SilentlyContinue | Remove-Item -Force
}

Write-Host '== 완료' -ForegroundColor Green
foreach ($f in 'chunjiin.exe', 'chunjiin-setup.exe') {
    $size = [math]::Round((Get-Item (Join-Path $root $f)).Length / 1MB, 1)
    Write-Host ("   {0,-22} {1,6} MB" -f $f, $size) -ForegroundColor Green
}
Write-Host ''
Write-Host '   chunjiin-setup.exe 를 실행하면' -ForegroundColor Gray
Write-Host '   %LOCALAPPDATA%\Programs\Chunjiin 에 설치된다 (관리자 권한 불필요).' -ForegroundColor Gray
