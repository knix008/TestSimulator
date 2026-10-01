<#
.SYNOPSIS
    Publishes MyDesktop and packages it as a Windows installer (.msi).

.DESCRIPTION
    The publish is self-contained, so the installed copy brings its own .NET and runs on a machine
    that has never had a runtime installed. The finished .msi is copied to the project root.

.EXAMPLE
    .\installer\build-installer.ps1
    .\installer\build-installer.ps1 -Version 1.1.0
#>
[CmdletBinding()]
param(
    [string] $Version = '1.0.0',
    [string] $Runtime = 'win-x64',

    # Build only when the installer in the project root is older than something it is made from.
    # Packaging republishes 130 MB of runtime, which is too slow to sit in every compile.
    [switch] $IfStale
)

$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$projectFile = Join-Path $project 'MyDesktop.csproj'
$iconFile = Join-Path $project 'Assets\mydesktop.ico'
$publishDir = Join-Path $project "installer\stage\$Runtime"
$wxs = Join-Path $PSScriptRoot 'MyDesktop.wxs'
$licenseFile = Join-Path $PSScriptRoot 'License.rtf'
$msiName = "MyDesktop-$Version-$Runtime.msi"
$msiPath = Join-Path $PSScriptRoot $msiName
$destination = Join-Path $project $msiName

function Get-NewestInput {
    $inputs = Get-ChildItem $project -Recurse -File -Include *.cs, *.xaml, *.csproj, *.wxs, *.rtf, *.ico |
        Where-Object { $_.FullName -notmatch '\\(obj|bin|publish|stage)\\' }
    if (-not $inputs) { return [DateTime]::MaxValue }
    return ($inputs | Measure-Object LastWriteTime -Maximum).Maximum
}

if ($IfStale) {
    $existing = Get-Item $destination -ErrorAction SilentlyContinue
    if ($existing -and $existing.LastWriteTime -ge (Get-NewestInput)) {
        Write-Host "installer is up to date: $destination"
        return
    }
}

if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
    throw 'The WiX tool is not on PATH. Install it with:  dotnet tool install --global wix'
}

# The app locks its own exe while it runs, and a stale stage folder would be harvested into the msi.
# Stop-MyDesktop is used rather than a bare Kill because a forced stop skips the app's own cleanup,
# and that cleanup is what switches the desktop icons back on. Killing it here without restoring
# them leaves the user looking at an empty desktop with no idea which program did it.
. (Join-Path $project 'common.ps1')
$null = Stop-MyDesktop

if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }

Write-Host "publishing $Runtime (self-contained)"
$output = & dotnet publish $projectFile `
    -c Release -r $Runtime --self-contained true `
    -p:PublishSingleFile=false -p:DebugType=none `
    -o $publishDir -v q --nologo

if ($LASTEXITCODE -ne 0) {
    foreach ($line in $output) { Write-Host $line }
    throw "publish failed (exit code $LASTEXITCODE)"
}

$payload = @(Get-ChildItem $publishDir -Recurse -File)
$megabytes = [Math]::Round((($payload | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host ("  " + $payload.Count + " files, $megabytes MB")

Write-Host 'building installer'
# The feature tree page that lets the shortcuts be chosen lives in the UI extension.
$null = & wix extension add --global WixToolset.UI.wixext 2>&1

$build = & wix build $wxs `
    -arch x64 `
    -ext WixToolset.UI.wixext `
    -d "Version=$Version" `
    -d "PublishDir=$publishDir" `
    -d "IconFile=$iconFile" `
    -d "LicenseFile=$licenseFile" `
    -o $msiPath 2>&1

if ($LASTEXITCODE -ne 0) {
    foreach ($line in $build) { Write-Host $line }
    throw "wix build failed (exit code $LASTEXITCODE)"
}

foreach ($line in $build) { if ("$line".Trim()) { Write-Host "  $line" } }

# The finished installer belongs where it can be found without digging through build folders.
Copy-Item $msiPath $destination -Force

$size = [Math]::Round(((Get-Item $destination).Length / 1MB), 1)
Write-Host ''
Write-Host "installer: $destination ($size MB)"
Write-Host 'installer ok'
