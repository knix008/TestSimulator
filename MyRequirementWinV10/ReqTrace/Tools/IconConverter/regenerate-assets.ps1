# Regenerates transparent app/project icons in ReqTrace/Assets.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Assets = Join-Path $Root "Assets"
$Converter = Join-Path $Root "Tools\IconConverter\IconConverter.csproj"

$appPng = Join-Path $Assets "app-icon.png"
$projectPng = Join-Path $Assets "project-icon.png"
$appIco = Join-Path $Assets "app-icon.ico"
$projectIco = Join-Path $Assets "project-icon.ico"

Write-Host "Generating transparent icons..." -ForegroundColor Cyan
dotnet run --project $Converter -- generate-app $appPng
dotnet run --project $Converter -- generate-project $projectPng
dotnet run --project $Converter -- to-ico $appPng $appIco
dotnet run --project $Converter -- to-ico $projectPng $projectIco

Write-Host "Updated:" -ForegroundColor Green
Write-Host "  $appPng"
Write-Host "  $appIco"
Write-Host "  $projectPng"
Write-Host "  $projectIco"
