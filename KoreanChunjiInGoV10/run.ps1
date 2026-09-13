# run.ps1 - 천지인 한글 입력기를 바로 실행한다.
#
#   .\run.ps1
#
# 실행 파일이 없으면 먼저 빌드한다. 있으면 그대로 띄운다.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$exe = Join-Path $root 'chunjiin.exe'
if (-not (Test-Path $exe)) {
    Write-Host '실행 파일이 없어 먼저 빌드합니다.' -ForegroundColor Cyan
    & "$root\build.ps1"
    if ($LASTEXITCODE -ne 0) { throw '빌드 실패' }
    if (-not (Test-Path $exe)) { throw 'chunjiin.exe 를 만들지 못했다' }
}

Write-Host '실행  chunjiin.exe' -ForegroundColor Green
Start-Process -FilePath $exe
