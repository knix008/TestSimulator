<#
.SYNOPSIS
    Builds MyDesktop if needed and puts its fences on the desktop.

.EXAMPLE
    .\run.ps1                # build Debug, restart the app
    .\run.ps1 -NoBuild       # launch whatever is already built
    .\run.ps1 -Release       # build and run Release
    .\run.ps1 -Stop          # shut it down (and make sure desktop icons are back)
    .\run.ps1 -Reset         # set the saved layout aside and start from a fresh first run
#>
[CmdletBinding()]
param(
    [switch] $Release,
    [switch] $NoBuild,
    [switch] $Stop,
    [switch] $Reset
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$configuration = if ($Release) { 'Release' } else { 'Debug' }
$workspace = Join-Path $env:LOCALAPPDATA 'MyDesktop\fences.json'

if ($Stop) {
    if (-not (Stop-MyDesktop)) { Write-Host 'MyDesktop was not running' }
    return
}

# MyDesktop only allows one instance, so a second launch would exit without a word.
$null = Stop-MyDesktop

if ($Reset -and (Test-Path $workspace)) {
    $backup = "$workspace.bak"
    Move-Item $workspace $backup -Force
    Write-Host "saved layout moved aside to $backup"
}

if (-not $NoBuild) {
    Invoke-MyDesktopBuild -Configuration $configuration
    Write-Host ''
}

$exe = Get-MyDesktopExe -Configuration $configuration
if (-not $exe) {
    throw "No $configuration build found. Run .\build.ps1 first, or drop -NoBuild."
}

Write-Host "starting $exe"
Start-Process $exe
Start-Sleep -Seconds 3

$proc = Get-Process MyDesktop -ErrorAction SilentlyContinue
if (-not $proc) {
    throw 'MyDesktop exited right after starting. Run it from a console to see why.'
}

Add-ShellIconType
$fences = [MyDesktopShell]::CountVisibleWindows($proc.Id, 'MyDesktop fence')

Write-Host ''
Write-Host ("running as pid $($proc.Id) with $fences fence(s) on the desktop")
Write-Host 'tray icon: right-click for the menu, double-click for settings'
Write-Host 'right-drag empty desktop draws a fence; double-click empty desktop hides them all'
Write-Host 'stop it with:  .\run.ps1 -Stop'
