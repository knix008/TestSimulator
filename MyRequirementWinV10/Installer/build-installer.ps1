# Builds the ReqTrace MSI installer (WiX Toolset).
# Usage: .\build-installer.ps1 [-Configuration Release]

param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$InstallerProject = Join-Path $PSScriptRoot "ReqTrace.Installer.wixproj"
$OutputDir = Join-Path $PSScriptRoot "Output"

if ($Configuration -ne "Release") {
    Write-Warning "MSI packaging is supported only for Release configuration."
}

Write-Host "Building ReqTrace MSI ($Configuration)..." -ForegroundColor Cyan
dotnet build $InstallerProject -c $Configuration -p:Platform=x64

if ($LASTEXITCODE -ne 0) {
    throw "MSI build failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Installer output:" -ForegroundColor Green
Get-ChildItem $OutputDir -Filter "*.msi" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.FullName)" }
