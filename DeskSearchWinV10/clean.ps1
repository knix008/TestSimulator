<#
.SYNOPSIS
    Removes DeskSearch build outputs (bin/, obj/, publish, MSI).

.DESCRIPTION
    Deletes bin/ and obj/ of DeskSearch and DeskSearch.Installer, and the DeskSearch.exe /
    DeskSearchSetup*.msi copies that build.ps1 places in the repository root.
    User data in %AppData%\DeskSearch (settings.json, index.db) is never touched.
    If DeskSearch.exe from this folder is running, the script stops and asks you
    to quit it first instead of killing it.

.EXAMPLE
    .\clean.ps1
#>
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$targets = @(
    'DeskSearch\bin',
    'DeskSearch\obj',
    'DeskSearch.Installer\bin',
    'DeskSearch.Installer\obj',
    'DeskSearch.exe',
    'DeskSearchSetup.msi',
    'DeskSearchSetup.en-US.msi'
) | ForEach-Object { Join-Path $root $_ }

$running = Get-Process -Name DeskSearch -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) }
if ($running) {
    Write-Host 'DeskSearch built from this folder is running:' -ForegroundColor Yellow
    $running | ForEach-Object { Write-Host "  PID $($_.Id)  $($_.Path)" }
    Write-Host 'Exit it from the tray menu, then run clean again.' -ForegroundColor Yellow
    exit 1
}

Write-Host '== DeskSearch clean ==' -ForegroundColor Cyan
$failed = $false
foreach ($dir in $targets) {
    if (-not (Test-Path $dir)) { continue }
    try {
        Remove-Item -LiteralPath $dir -Recurse -Force
        Write-Host "  removed $dir"
    }
    catch {
        Write-Host "  could not remove ${dir}: $($_.Exception.Message)" -ForegroundColor Red
        $failed = $true
    }
}

if ($failed) { exit 1 }
Write-Host 'Clean done.' -ForegroundColor Green
