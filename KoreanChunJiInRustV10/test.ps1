# test.ps1 - 시험을 돌리고 구역별로 정리해서 보여 준다.
#
#   .	est.ps1              구역별 집계와 요약
#   .	est.ps1 -Detail      항목마다 한 줄씩
#   .	est.ps1 -Run 낱말    이름이 맞는 것만
#   .	est.ps1 -Plain       cargo test 를 그대로 (정리하지 않는다)
#
# 무엇을 보는가
#   crates/engine/tests  엔진 회귀 시험. KoreanChunJiInC++ 의 tests/test_engine.c
#                        에서 뽑아 온 430항목(test\cases.tsv)과, 자료로 뽑을 수
#                        없는 항목들.
#   crates/ui/tests      색표 · 설정 · 배치 · 커서 변환 · 언어 · 그림, 그리고
#                        창까지 만들어 보는 스모크 시험.
#   그 밖               서버 경로 처리, 시험 자료 읽기, 보고기 자체.
#
# 정리해서 보여 주는 일은 crates/testreport 가 한다.

[CmdletBinding()]
param(
    [switch]$Detail,
    [switch]$Plain,
    [string]$Run = ''
)

$ErrorActionPreference = 'Stop'
# 콘솔이 한글을 깨뜨리지 않게 UTF-8 로 맞춘다.
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

if ($Plain) {
    cargo test --workspace
    exit $LASTEXITCODE
}

$reportArgs = @()
if ($Detail) { $reportArgs += '-v' }
if ($Run) { $reportArgs += @('-run', $Run) }

cargo run -q -p chunjiin-testreport -- @reportArgs
exit $LASTEXITCODE
