<#
.SYNOPSIS
    Builds MyDesktop.

.EXAMPLE
    .\build.ps1                     # Debug build
    .\build.ps1 -Release            # Release build
    .\build.ps1 -Release -Clean     # wipe intermediates first
    .\build.ps1 -Release -Publish   # single self-contained exe in .\publish
    .\build.ps1 -Installer          # rebuild the .msi even if it is already current
    .\build.ps1 -NoInstaller        # compile only, leave the .msi alone

.NOTES
    Every build leaves a current .msi in the project root. Packaging republishes 130 MB of runtime,
    so it is skipped while the installer already sitting there is newer than every source file.
#>
[CmdletBinding()]
param(
    [switch] $Release,
    [switch] $Clean,
    [switch] $Publish,
    [switch] $Installer,
    [switch] $NoInstaller
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$installerScript = Join-Path $PSScriptRoot 'installer\build-installer.ps1'

if ($Installer) {
    # The installer script does its own publish, because what it ships is a self-contained build.
    & $installerScript
    return
}

$configuration = if ($Release -or $Publish) { 'Release' } else { 'Debug' }

# The running app holds a lock on its own exe, so it has to go before the compiler can write it.
if (Stop-MyDesktop) { Write-Host '' }

Invoke-MyDesktopBuild -Configuration $configuration -Clean:$Clean

if ($Publish) {
    $target = Join-Path $PSScriptRoot 'publish'
    Write-Host ''
    Write-Host "publishing single file to $target"

    $output = & dotnet publish (Join-Path $PSScriptRoot 'MyDesktop.csproj') `
        -c Release -r win-x64 --self-contained false `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
        -o $target -v q --nologo

    if ($LASTEXITCODE -ne 0) {
        foreach ($line in $output) { Write-Host $line }
        throw "publish failed (exit code $LASTEXITCODE)"
    }

    Write-Host ('  ' + (Join-Path $target 'MyDesktop.exe'))
    Write-Host 'publish ok'
    return
}

if (-not $NoInstaller) {
    Write-Host ''
    & $installerScript -IfStale
}

$exe = Get-MyDesktopExe -Configuration $configuration
if ($exe) {
    Write-Host ''
    Write-Host "output: $exe"
    Write-Host 'run it with:  .\run.ps1'
}
