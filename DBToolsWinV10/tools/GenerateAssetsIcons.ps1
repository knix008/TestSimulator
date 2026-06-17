# Regenerate all Assets/*.ico files (app + .mdprj extension icons).
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "GenerateAppIcon.ps1")
& (Join-Path $PSScriptRoot "GenerateFileIcon.ps1")
