# clean.ps1 - 빌드 결과를 지운다.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

foreach ($d in @('out', 'dist')) {
    if (Test-Path $d) { Remove-Item $d -Recurse -Force }
}
Write-Host 'out\ 과 dist\ 를 지웠습니다.'
