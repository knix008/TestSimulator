# Build the Windows installer from the repository root.
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'scripts\build.ps1'
& $target @args
exit $LASTEXITCODE
