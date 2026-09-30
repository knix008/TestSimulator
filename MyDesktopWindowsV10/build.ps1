<#
.SYNOPSIS
    Builds Palisades.

.EXAMPLE
    .\build.ps1                     # Debug build
    .\build.ps1 -Release            # Release build
    .\build.ps1 -Release -Clean     # wipe intermediates first
    .\build.ps1 -Release -Publish   # single self-contained exe in .\publish
#>
[CmdletBinding()]
param(
    [switch] $Release,
    [switch] $Clean,
    [switch] $Publish
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$configuration = if ($Release -or $Publish) { 'Release' } else { 'Debug' }

# The running app holds a lock on its own exe, so it has to go before the compiler can write it.
if (Stop-Palisades) { Write-Host '' }

Invoke-PalisadesBuild -Configuration $configuration -Clean:$Clean

if ($Publish) {
    $target = Join-Path $PSScriptRoot 'publish'
    Write-Host ''
    Write-Host "publishing single file to $target"

    $output = & dotnet publish (Join-Path $PSScriptRoot 'Palisades.csproj') `
        -c Release -r win-x64 --self-contained false `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
        -o $target -v q --nologo

    if ($LASTEXITCODE -ne 0) {
        foreach ($line in $output) { Write-Host $line }
        throw "publish failed (exit code $LASTEXITCODE)"
    }

    Write-Host ('  ' + (Join-Path $target 'Palisades.exe'))
    Write-Host 'publish ok'
    return
}

$exe = Get-PalisadesExe -Configuration $configuration
if ($exe) {
    Write-Host ''
    Write-Host "output: $exe"
    Write-Host 'run it with:  .\run.ps1'
}
