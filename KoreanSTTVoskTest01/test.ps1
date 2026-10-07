<#
test.ps1

코어 시험을 빌드해서 돌린다. 모델과 libvosk 가 있으면 실제 인식까지 확인한다.

사용법:
  .\test.ps1
  .\test.ps1 -NoBuild
#>
[CmdletBinding()]
param([switch]$NoBuild)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not $NoBuild) {
    & (Join-Path $PSScriptRoot 'build.ps1')
    if ($LASTEXITCODE -ne 0) { throw "빌드가 실패했습니다" }
}

$sample = Join-Path $root 'tests\data\sample-ko.wav'
if (-not (Test-Path $sample)) {
    Write-Host "==> 시험 음원을 만듭니다" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'scripts\make_sample_wav.ps1')
}

& (Join-Path $PSScriptRoot 'run.ps1') tests
exit $LASTEXITCODE
