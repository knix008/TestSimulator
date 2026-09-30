<#
.SYNOPSIS
    Builds MyDesktop.

.EXAMPLE
    .\build.ps1                     # Debug build
    .\build.ps1 -Release            # Release build
    .\build.ps1 -Release -Clean     # wipe intermediates first
    .\build.ps1 -Release -Publish   # single self-contained exe in .\publish
    .\build.ps1 -Installer          # .msi installer, copied to the project root
#>
[CmdletBinding()]
param(
    [switch] $Release,
    [switch] $Clean,
    [switch] $Publish,
    [switch] $Installer
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

if ($Installer) {
    # The installer script does its own publish, because what it ships is a self-contained build.
    & (Join-Path $PSScriptRoot 'installer\build-installer.ps1')
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

$exe = Get-MyDesktopExe -Configuration $configuration
if ($exe) {
    Write-Host ''
    Write-Host "output: $exe"
    Write-Host 'run it with:  .\run.ps1'
}
