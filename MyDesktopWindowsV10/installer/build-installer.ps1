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
    # Left empty, a fresh version is stamped on every build. See New-BuildVersion below.
    [string] $Version,
    [string] $Runtime = 'win-x64'
)

$ErrorActionPreference = 'Stop'

<#
    Why every build gets its own version.

    Windows Installer compares only the first three fields of ProductVersion, and it will not
    overwrite a file whose version already matches the one on disk. While every build was stamped
    1.0.0 / 1.0.0.0, installing a new .msi over an older install did nothing: setup reported
    success and left the previous binaries in place, so a bug that had just been fixed was still
    there afterwards and nothing on screen said why.

    So the third field carries the day (2026-01-01 is 1, and it keeps climbing for a century and a
    half), and the fourth carries the minute of that day. The third is what makes Windows Installer
    treat this as a newer product; the fourth is what makes it replace the files when two builds are
    made on the same day. The .wxs also allows same-version upgrades, which covers the rest.
#>
function New-BuildVersion {
    $now = Get-Date
    $day = ($now.Year - 2026) * 366 + $now.DayOfYear
    $minute = $now.Hour * 60 + $now.Minute
    return [pscustomobject]@{
        Product = "1.0.$day"
        File    = "1.0.$day.$minute"
    }
}

$stamp = New-BuildVersion
if (-not $Version) { $Version = $stamp.Product }
$fileVersion = if ($Version -eq $stamp.Product) { $stamp.File } else { "$Version.0" }

$project = Split-Path -Parent $PSScriptRoot
$projectFile = Join-Path $project 'MyDesktop.csproj'
$iconFile = Join-Path $project 'Assets\mydesktop.ico'
$publishDir = Join-Path $project "installer\stage\$Runtime"
$wxs = Join-Path $PSScriptRoot 'MyDesktop.wxs'
$licenseFile = Join-Path $PSScriptRoot 'License.rtf'

# One installer, always the current one. A name with the version in it would leave a row of .msi
# files in the project root, and the whole point of this change is that nobody can accidentally
# install yesterday's build.
$msiName = "MyDesktop-$Runtime.msi"
$msiPath = Join-Path $PSScriptRoot $msiName
$destination = Join-Path $project $msiName

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

Write-Host "publishing $Runtime (self-contained), version $Version ($fileVersion)"

# Note for anyone tempted to give this publish its own obj\ with BaseIntermediateOutputPath: WPF's
# temporary markup-compile project picks up the generated .g.cs files from both intermediate trees
# and the build dies on duplicate InitializeComponent members. The configurations already keep their
# own subfolders; leave them to it.
$output = & dotnet publish $projectFile `
    -c Release -r $Runtime --self-contained true `
    -p:PublishSingleFile=false -p:DebugType=none `
    -p:Version=$Version -p:FileVersion=$fileVersion -p:AssemblyVersion=1.0.0.0 `
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

# Installers from the days when the name carried the version. Leaving them in the project root is
# how somebody ends up double-clicking a build from last week and wondering why their fix is missing.
foreach ($old in Get-ChildItem $project -Filter "MyDesktop-*-$Runtime.msi" -File) {
    if ($old.FullName -ne $destination) {
        Remove-Item $old.FullName -Force
        Write-Host "  removed stale installer $($old.Name)"
    }
}

$size = [Math]::Round(((Get-Item $destination).Length / 1MB), 1)
Write-Host ''
Write-Host "installer: $destination ($size MB), version $Version"
Write-Host 'installer ok'
