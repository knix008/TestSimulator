# Starts Device Simulator then PC Client for same-PC call testing.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Building..." -ForegroundColor Cyan
dotnet build "$root\RTSPClientWinV10.sln" -c Debug | Out-Host

$sim = "$root\src\RTSPDeviceSimWinV10\bin\Debug\net8.0-windows\RTSPDeviceSimWinV10.exe"
$pc  = "$root\src\RTSPClientWinV10\bin\Debug\net8.0-windows\RTSPClientWinV10.exe"

if (-not (Test-Path $sim)) { throw "Simulator exe not found: $sim" }
if (-not (Test-Path $pc))  { throw "Client exe not found: $pc" }

Write-Host "Starting Device Simulator..." -ForegroundColor Cyan
Start-Process -FilePath $sim

Start-Sleep -Seconds 1

Write-Host "Starting PC Client..." -ForegroundColor Cyan
Start-Process -FilePath $pc

Write-Host @"

Next steps:
  1) In Device Simulator: click 'Start simulator'
  2) In PC Client: click 'Local sim', then 'Start call'
  3) Keep '(test pattern)' on at least one side if you have only one webcam

"@ -ForegroundColor Green
