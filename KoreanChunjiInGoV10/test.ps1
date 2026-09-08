# test.ps1 - 시험을 돌린다.
#
#   .\test.ps1              요약만 본다
#   .\test.ps1 -Verbose     항목마다 PASS/FAIL 을 본다
#   .\test.ps1 -Cover       덮은 정도(coverage)까지 잰다
#
# 엔진 회귀 시험은 KoreanChunJiInC++ 의 tests/test_engine.c 를 옮긴 것으로
# 34구역 586항목이다. 화면 계층은 색표 · 설정 · 배치 · 커서 변환 · 언어를 본다.

[CmdletBinding()]
param(
    [switch]$Cover
)

$ErrorActionPreference = 'Stop'
# 콘솔이 한글을 깨뜨리지 않게 UTF-8 로 맞춘다.
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host '== 천지인 회귀 시험' -ForegroundColor Cyan

$args = @('test', './...')
if ($VerbosePreference -eq 'Continue') { $args += '-v' }
if ($Cover) { $args += @('-cover', '-coverprofile=coverage.out') }

go @args
if ($LASTEXITCODE -ne 0) {
    Write-Host '== 실패' -ForegroundColor Red
    exit 1
}

if ($Cover) {
    Write-Host '-- 덮은 정도' -ForegroundColor Cyan
    go tool cover -func=coverage.out | Select-Object -Last 1
}

Write-Host '== 모두 통과' -ForegroundColor Green
