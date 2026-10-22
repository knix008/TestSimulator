<#
.SYNOPSIS
    Builds DeskSearch.

.DESCRIPTION
    Debug   : builds DeskSearch/bin/Debug/net8.0-windows/DeskSearch.exe
    Release : self-contained publish + MSI installers
              (DeskSearch.Installer/bin/Release/DeskSearchSetup.msi, DeskSearchSetup.en-US.msi)
              Note: a Release build closes a running DeskSearch.exe (it locks the publish files).

    Both then copy the results to the repository root:
      DeskSearch.exe                                  self-contained single file (runs alone)
      DeskSearchSetup.msi, DeskSearchSetup.en-US.msi  Release with MSI only

.EXAMPLE
    .\build.ps1                  # Debug build
    .\build.ps1 -Release         # Release build + MSI
    .\build.ps1 -Release -NoMsi  # Release build without MSI
    .\build.ps1 -Clean           # clean first, then build
    .\build.ps1 -Run             # Debug build, then launch
    .\build.ps1 -Stop            # close a running DeskSearch built here, then build
#>
param(
    [switch]$Release,
    [switch]$NoMsi,
    [switch]$Clean,
    [switch]$Run,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$configuration = if ($Release) { 'Release' } else { 'Debug' }

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host 'dotnet SDK not found. Install the .NET 8 SDK.' -ForegroundColor Red
    exit 1
}

# A running DeskSearch.exe from this folder locks its output files: the build would retry
# the copy 10 times (MSB3026 warnings) and then fail (MSB3027/MSB3021).
$running = @(Get-Process -Name DeskSearch -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) })
if ($running.Count -gt 0) {
    if (-not $Stop) {
        Write-Host 'DeskSearch built from this folder is running and locks the build output:' -ForegroundColor Yellow
        $running | ForEach-Object { Write-Host "  PID $($_.Id)  $($_.Path)" }
        Write-Host 'Exit it from the tray menu, or rerun with -Stop to close it.' -ForegroundColor Yellow
        exit 1
    }

    foreach ($process in $running) {
        Write-Host "Closing DeskSearch (PID $($process.Id))"
        Stop-Process -Id $process.Id -Force
        $process.WaitForExit(10000) | Out-Null
    }
}

if ($Clean) {
    & (Join-Path $root 'clean.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$stopwatch = [Diagnostics.Stopwatch]::StartNew()
Write-Host "== DeskSearch $configuration build ==" -ForegroundColor Cyan

if ($Release -and $NoMsi) {
    $buildArgs = @('build', (Join-Path $root 'DeskSearch\DeskSearch.csproj'), '-c', 'Release', '-p:SkipInstaller=true')
}
else {
    $buildArgs = @('build', (Join-Path $root 'DeskSearchWinV10.slnx'), '-c', $configuration)
}

& dotnet @buildArgs -nologo
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

# The regular build output is DeskSearch.exe plus dozens of DLLs, so the exe alone cannot
# be copied. Publish a self-contained single-file exe (runtime + Assets bundled) for the root.
Write-Host '== Single-file DeskSearch.exe ==' -ForegroundColor Cyan
$singleDir = Join-Path $root "DeskSearch\bin\$configuration\single-file"
& dotnet publish (Join-Path $root 'DeskSearch\DeskSearch.csproj') -c $configuration -r win-x64 `
    --self-contained true -o $singleDir -nologo `
    -p:PublishSingleFile=true `
    -p:IncludeAllContentForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -p:SkipInstaller=true
if ($LASTEXITCODE -ne 0) {
    Write-Host "Single-file publish FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

$artifacts = @(Join-Path $singleDir 'DeskSearch.exe')
if ($Release -and -not $NoMsi) {
    $artifacts += Join-Path $root 'DeskSearch.Installer\bin\Release\DeskSearchSetup.msi'
    $artifacts += Join-Path $root 'DeskSearch.Installer\bin\Release\DeskSearchSetup.en-US.msi'
}

$copied = @()
foreach ($path in $artifacts) {
    if (-not (Test-Path $path)) {
        Write-Host "  missing: $path" -ForegroundColor Red
        exit 1
    }
    Copy-Item -LiteralPath $path -Destination $root -Force
    $copied += Join-Path $root (Split-Path $path -Leaf)
}

$stopwatch.Stop()
Write-Host ("Build succeeded in {0:N1}s. Copied to {1}:" -f $stopwatch.Elapsed.TotalSeconds, $root) -ForegroundColor Green
foreach ($path in $copied) {
    $size = (Get-Item $path).Length / 1MB
    Write-Host ("  {0}  ({1:N1} MB)" -f (Split-Path $path -Leaf), $size)
}

$exe = Join-Path $root 'DeskSearch.exe'

if ($Run) {
    Write-Host "Launching $exe"
    Start-Process -FilePath $exe
}
