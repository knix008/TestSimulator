$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$msiPath = Join-Path $scriptDir "bin\x64\Release\VideoPlayerV10.Installer.msi"

if (-not (Test-Path $msiPath)) {
    Write-Error "MSI not found: $msiPath"
}

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Requesting administrator privileges..."
    $args = "/i `"$msiPath`""
    Start-Process -FilePath "msiexec.exe" -ArgumentList $args -Verb RunAs | Out-Null
    exit 0
}

Write-Host "Installing MSI as administrator..."
Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$msiPath`"" -Wait -NoNewWindow
