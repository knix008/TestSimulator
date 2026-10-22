<#
.SYNOPSIS
    Builds the DeskSearch installer and copies it to the repository root.

.DESCRIPTION
    Default : Release build (self-contained publish) + MSI installers, then copies
                DeskSearchSetup.msi        (installer UI: Korean)
                DeskSearchSetup.en-US.msi  (installer UI: English)
              to the repository root.
              Note: a Release build closes a running DeskSearch.exe (it locks the publish files).
    -Debug  : development build only (DeskSearch/bin/Debug/net8.0-windows/DeskSearch.exe),
              no installer.

.EXAMPLE
    .\build.ps1                  # installer -> repository root
    .\build.ps1 -Clean           # clean first, then build the installer
    .\build.ps1 -NoMsi           # Release build without installer
    .\build.ps1 -Debug -Run      # development build, then launch
    .\build.ps1 -Stop            # close a running DeskSearch built here, then build
#>
param(
    [switch]$Debug,
    [switch]$NoMsi,
    [switch]$Clean,
    [switch]$Run,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$configuration = if ($Debug) { 'Debug' } else { 'Release' }
$buildInstaller = -not $Debug -and -not $NoMsi

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
    # $LASTEXITCODE is $null until a native command runs; clean.ps1 always sets it via exit.
    & (Join-Path $root 'clean.ps1')
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
}

$stopwatch = [Diagnostics.Stopwatch]::StartNew()
$label = if ($buildInstaller) { 'Release build + installer' } else { "$configuration build" }
Write-Host "== DeskSearch $label ==" -ForegroundColor Cyan

# Build only the app project: in Release its BuildInstallerOnRelease target builds the MSI.
# Building the .slnx would also build the installer project directly, and the two parallel
# WiX runs collide on obj\Release\<culture>\#cab1.cab ("file in use", WIX0001).
$buildArgs = @('build', (Join-Path $root 'DeskSearch\DeskSearch.csproj'), '-c', $configuration)
if (-not $buildInstaller) {
    $buildArgs += '-p:SkipInstaller=true'
}
else {
    # That nested installer build does not restore the WiX project itself.
    & dotnet restore (Join-Path $root 'DeskSearchWinV10.slnx') -nologo
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Restore FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

& dotnet @buildArgs -nologo
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

$copied = @()
if ($buildInstaller) {
    $installerDir = Join-Path $root 'DeskSearch.Installer\bin\Release'
    foreach ($name in 'DeskSearchSetup.msi', 'DeskSearchSetup.en-US.msi') {
        $path = Join-Path $installerDir $name
        if (-not (Test-Path $path)) {
            Write-Host "  installer missing: $path" -ForegroundColor Red
            exit 1
        }
        Copy-Item -LiteralPath $path -Destination $root -Force
        $copied += Join-Path $root $name
    }
}

$stopwatch.Stop()
Write-Host ("Build succeeded in {0:N1}s" -f $stopwatch.Elapsed.TotalSeconds) -ForegroundColor Green
foreach ($path in $copied) {
    $size = (Get-Item $path).Length / 1MB
    Write-Host ("  {0}  ({1:N1} MB)" -f $path, $size)
}

if ($Run) {
    $exe = if ($Debug) {
        Join-Path $root 'DeskSearch\bin\Debug\net8.0-windows\DeskSearch.exe'
    } else {
        Join-Path $root 'DeskSearch\bin\Release\net8.0-windows\win-x64\DeskSearch.exe'
    }
    Write-Host "Launching $exe"
    Start-Process -FilePath $exe
}
