param(
  [switch]$SkipWindows,
  [switch]$SkipLinuxPortable,
  [switch]$LinuxDocker
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '[build-installers] Syncing build assets...'
node scripts/sync-build-assets.js

if (-not $SkipWindows) {
  Write-Host '[build-installers] Building Windows installers (Setup + Portable)...'
  npm run dist:win
}

if ($LinuxDocker) {
  Write-Host '[build-installers] Building Linux AppImage + deb (Docker)...'
  docker run --rm `
    -v "${PWD}:/project" `
    -w /project `
    electronuserland/builder:latest `
    /bin/bash -lc "npm ci && node scripts/sync-build-assets.js && npm run dist:linux"
} elseif (-not $SkipLinuxPortable) {
  Write-Host '[build-installers] Building Linux portable archive (tar.gz)...'
  npm run dist:linux:portable
}

Write-Host ''
Write-Host '=== MyWorkspace installers (project root) ==='
Get-ChildItem . -File |
  Where-Object {
    $_.Name -like 'MyWorkspace-Setup-*.exe' -or
    $_.Name -like 'MyWorkspace-Portable-*.exe' -or
    $_.Name -like 'MyWorkspace-*-mac-*' -or
    $_.Name -like 'MyWorkspace-*-linux-*'
  } |
  Sort-Object Name |
  ForEach-Object { Write-Host ('  {0} ({1:N1} MB)' -f $_.Name, ($_.Length / 1MB)) }

Write-Host ''
Write-Host 'macOS (dmg/zip): npm run dist:mac on a Mac, or run GitHub Actions Release workflow.'
Write-Host 'Linux AppImage/deb on Windows: re-run with -LinuxDocker (Docker Desktop required).'
