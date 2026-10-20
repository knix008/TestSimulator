# Compatibility entry. The build script lives in scripts\build.ps1.
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '..\..\scripts\build.ps1'
& (Resolve-Path $target) @args
exit $LASTEXITCODE
