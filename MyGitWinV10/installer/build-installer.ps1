param(
    [ValidateSet('Release', 'Debug')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path $PSScriptRoot -Parent
$InstallerProject = Join-Path $PSScriptRoot 'MyGitWinV10.Installer.wixproj'
$MsiPath = Join-Path $Root 'installer\bin\Release\MyGitWinV10Setup.msi'

Get-Process -Name 'MyGitWinV10.App' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Write-Host "Building MSI ($Configuration | x64)..." -ForegroundColor Cyan
dotnet restore $InstallerProject
dotnet build $InstallerProject -c $Configuration -p:Platform=x64 -p:BuildMsiPackage=true -m:1 --no-restore

if ($Configuration -ne 'Release') {
    Write-Host "Debug configuration skips MSI packaging." -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Path $MsiPath)) {
    throw "MSI build completed but no file was found at $MsiPath"
}

Write-Host "MSI created:" -ForegroundColor Green
Write-Host $MsiPath
