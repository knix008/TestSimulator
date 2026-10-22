<#
.SYNOPSIS
    Removes DeskSearch build outputs (bin/, obj/, publish, MSI).

.DESCRIPTION
    Deletes bin/ and obj/ of DeskSearch, DeskSearch.Installer, and DeskSearch.Setup,
    and the DeskSearchSetup.msi installer that build.ps1 copies to the repository root.
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
    'DeskSearch.Setup\bin',
    'DeskSearch.Setup\obj',
    'DeskSearchSetup.exe',
    'DeskSearchSetup.msi',
    'DeskSearchSetup.en-US.msi'
) | ForEach-Object { Join-Path $root $_ }
# Legacy root copies from older builds are still cleaned above.

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
    # Freshly built files are often held for a moment (antivirus scan, build nodes): retry.
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            Remove-Item -LiteralPath $dir -Recurse -Force
            Write-Host "  removed $dir"
            break
        }
        catch {
            if ($attempt -eq 5) {
                Write-Host "  could not remove ${dir}: $($_.Exception.Message)" -ForegroundColor Red
                $failed = $true
            }
            else {
                Start-Sleep -Seconds 2
            }
        }
    }
}

if ($failed) { exit 1 }
Write-Host 'Clean done.' -ForegroundColor Green
exit 0
