# run.ps1 - 프로그램을 띄운다.
#
# 언제나 먼저 다시 빌드한다. 고친 코드가 반영되지 않은 예전 JAR 이
# 도는 일이 없어야 하기 때문이다.
#
#   .\run.ps1             빌드하고 창을 띄운다
#   .\run.ps1 -NoBuild    이미 만들어 둔 JAR 을 그대로 띄운다

param([switch]$NoBuild)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not $NoBuild) { & "$PSScriptRoot\build.ps1" }

. "$PSScriptRoot\scripts\Find-Jdk.ps1"

& $script:JavaBin '-Dfile.encoding=UTF-8' -jar 'dist\Chunjiin.jar'
