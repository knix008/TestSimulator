# Remove build output from the repository root.
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'scripts\clean.ps1'
& $target @args
exit $LASTEXITCODE
