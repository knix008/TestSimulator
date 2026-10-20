# Run every feature test from the repository root.
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'scripts\test.ps1'
& $target @args
exit $LASTEXITCODE
