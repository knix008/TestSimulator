# HeatWave (WiX for Visual Studio) — requires elevation for per-machine install.
# Usage: Right-click PowerShell -> Run as administrator, then:
#   Set-Location 'D:\Home\Projects\TestSimulator\YOLO26V10\tools'
#   .\install-heatwave.ps1

#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$version = '1.0.8'
$url = "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/FireGiant/vsextensions/FireGiantHeatWaveDev17/$version/vspackage"
$vsix = Join-Path $env:TEMP "FireGiantHeatWaveDev17-$version.vsix"

Write-Host "Downloading HeatWave $version..."
Invoke-WebRequest -Uri $url -OutFile $vsix -UseBasicParsing

$vsixInstaller = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\resources\app\ServiceHub\Services\Microsoft.VisualStudio.Setup.Service\VSIXInstaller.exe'
if (-not (Test-Path $vsixInstaller)) {
    throw "VSIXInstaller not found: $vsixInstaller (Visual Studio installed?)"
}

Write-Host "Installing (quiet)..."
& $vsixInstaller /quiet /norestart $vsix
Write-Host "Done. Restart Visual Studio if it was open."
