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
    [string] $Runtime = 'win-x64'
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

if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
    throw 'The WiX tool is not on PATH. Install it with:  dotnet tool install --global wix'
}

# The app locks its own exe while it runs, and a stale stage folder would be harvested into the msi.
foreach ($process in @(Get-Process MyDesktop -ErrorAction SilentlyContinue)) {
    Write-Host ('stopping MyDesktop (pid ' + $process.Id + ')')
    $process.Kill()
    $null = $process.WaitForExit(10000)
}

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
$destination = Join-Path $project $msiName
Copy-Item $msiPath $destination -Force

$size = [Math]::Round(((Get-Item $destination).Length / 1MB), 1)
Write-Host ''
Write-Host "installer: $destination ($size MB)"
Write-Host 'installer ok'
