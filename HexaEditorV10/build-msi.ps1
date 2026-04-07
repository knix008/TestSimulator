param(
    [ValidateSet("Release", "Debug", "Both")]
    [string]$Configuration = "Both",
    [switch]$SkipClean
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$installerProject = Join-Path $projectRoot "installer\HexaEditorV10.Installer.wixproj"
$appProject = Join-Path $projectRoot "HexaEditorV10.csproj"

function Remove-IfExists {
    param([string]$PathToRemove)
    if (Test-Path -LiteralPath $PathToRemove) {
        Write-Host "Removing: $PathToRemove"
        Remove-Item -LiteralPath $PathToRemove -Recurse -Force
    }
}

function Build-Msi {
    param([string]$Config)

    Write-Host ""
    Write-Host "==== Building MSI ($Config) ===="
    dotnet build "$installerProject" -c $Config
    if ($LASTEXITCODE -ne 0) {
        throw "MSI build failed for configuration: $Config"
    }

    $msiPath = Join-Path $projectRoot "installer\msi\$Config\HexaEditorV10.Installer.msi"
    if (-not (Test-Path -LiteralPath $msiPath)) {
        throw "MSI not found after build: $msiPath"
    }
    Write-Host "MSI created: $msiPath"
}

Set-Location $projectRoot

if (-not (Test-Path -LiteralPath $installerProject)) {
    throw "Installer project not found: $installerProject"
}

if (-not $SkipClean) {
    Write-Host "==== Cleaning outputs ===="
    Remove-IfExists (Join-Path $projectRoot "bin")
    Remove-IfExists (Join-Path $projectRoot "obj")
    Remove-IfExists (Join-Path $projectRoot "installer\bin")
    Remove-IfExists (Join-Path $projectRoot "installer\msi")
    Remove-IfExists (Join-Path $projectRoot "installer\obj")
}

Write-Host "==== Restoring app project ===="
dotnet restore "$appProject"
if ($LASTEXITCODE -ne 0) {
    throw "dotnet restore failed."
}

switch ($Configuration) {
    "Release" { Build-Msi "Release" }
    "Debug" { Build-Msi "Debug" }
    "Both" {
        Build-Msi "Release"
        Build-Msi "Debug"
    }
}

Write-Host ""
Write-Host "Done."
