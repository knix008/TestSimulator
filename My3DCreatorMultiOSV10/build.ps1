# PowerShell Build Script for Omni3D Studio Multi-OS Installers
Write-Host "Starting Omni3D Studio Multi-OS Installer Build..." -ForegroundColor Cyan

# Run Node.js installer builder
node scripts/build-installers.js

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nAll installers successfully generated and placed in root directory!" -ForegroundColor Green
} else {
    Write-Host "`nBuild failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
