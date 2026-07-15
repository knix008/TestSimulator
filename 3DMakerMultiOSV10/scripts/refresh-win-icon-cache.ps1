$ErrorActionPreference = 'Stop'

Write-Host '[icon-cache] Stopping explorer.exe...'
Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force

$cacheFiles = @(
    "$env:LOCALAPPDATA\IconCache.db"
)

$explorerCacheDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Explorer'
if (Test-Path $explorerCacheDir) {
    $cacheFiles += Get-ChildItem -Path $explorerCacheDir -File -Filter 'iconcache*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
}

$deleted = 0
foreach ($file in $cacheFiles | Select-Object -Unique) {
    if (Test-Path $file) {
        Remove-Item -Path $file -Force -ErrorAction SilentlyContinue
        if (-not (Test-Path $file)) {
            $deleted++
            Write-Host "[icon-cache] Deleted: $file"
        }
    }
}

Write-Host '[icon-cache] Restarting explorer.exe...'
Start-Process explorer.exe

Write-Host "[icon-cache] Done. Deleted $deleted cache file(s)."
Write-Host '[icon-cache] Re-pin shortcuts if stale icons are still shown.'
