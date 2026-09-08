# build.ps1 - 바로 실행할 수 있는 실행 파일을 만든다.
#
#   .\build.ps1              현재 운영체제용으로 빌드하고 저장소 루트에 둔다
#   .\build.ps1 -Run         빌드한 뒤 곧바로 실행한다
#   .\build.ps1 -Web         웹 판(WASM + 정적 파일)까지 함께 만든다
#
# 설치용 파일은 이 스크립트가 만들지 않는다. scripts\package.ps1 을 쓴다.

[CmdletBinding()]
param(
    [switch]$Run,
    [switch]$Web
)

$ErrorActionPreference = 'Stop'
# 콘솔이 한글을 깨뜨리지 않게 UTF-8 로 맞춘다.
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$version = '1.0'
$ldflags = "-s -w -X github.com/knix008/chunjiin/internal/ui.Version=$version"

Write-Host '== 천지인 한글 입력기 빌드' -ForegroundColor Cyan
Write-Host ("   Go        " + (go version))

# 데스크톱 앱. -H windowsgui 를 주어야 콘솔 창이 따라 뜨지 않는다.
Write-Host '-- 데스크톱 앱' -ForegroundColor Cyan
go build -ldflags "-H windowsgui $ldflags" -o chunjiin.exe ./cmd/chunjiin
if ($LASTEXITCODE -ne 0) { throw '데스크톱 앱 빌드 실패' }
$size = [math]::Round((Get-Item chunjiin.exe).Length / 1MB, 1)
Write-Host "   chunjiin.exe  $size MB" -ForegroundColor Green

if ($Web) {
    Write-Host '-- 웹 판' -ForegroundColor Cyan
    & "$root\scripts\build-web.ps1"
    if ($LASTEXITCODE -ne 0) { throw '웹 판 빌드 실패' }
}

Write-Host '== 빌드 완료' -ForegroundColor Green

if ($Run) {
    Write-Host '-- 실행' -ForegroundColor Cyan
    & "$root\chunjiin.exe"
}
