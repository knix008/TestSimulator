# ============================================================
#  RemBGWin MSI 빌드 스크립트  (WiX 6 CLI 사용)
#
#  전제 조건:
#    dotnet tool install -g wix
#
#  사용법: .\build-installer.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectDir   = $PSScriptRoot
$PublishDir   = "$ProjectDir\bin\Release\net10.0-windows\win-x64\publish\"
$InstallerDir = "$ProjectDir\Installer"
$OutputDir    = "$InstallerDir\bin\Release"
$OutputMsi    = "$OutputDir\RemBGWin-Setup.msi"

# ── Step 1: 앱 단일 파일 Publish ────────────────────────────────────────
Write-Host ""
Write-Host "=== Step 1: 앱 Publish ===" -ForegroundColor Cyan
dotnet publish "$ProjectDir\RemBGWin1.0.csproj" -c Release
if ($LASTEXITCODE -ne 0) { Write-Host "Publish 실패" -ForegroundColor Red; exit 1 }

# ── Step 2: WiX UI 확장 추가 (없으면 설치) ──────────────────────────────
Write-Host ""
Write-Host "=== Step 2: WiX UI 확장 설치 ===" -ForegroundColor Cyan
wix extension add WixToolset.UI.wixext/6.0.2 2>&1 | Out-Null
Write-Host "WiX UI 확장 준비 완료"

# ── Step 3: MSI 빌드 ────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Step 3: MSI 빌드 ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

wix build "$InstallerDir\Package.wxs" `
    -ext WixToolset.UI.wixext `
    -d "PublishDir=$PublishDir" `
    -o "$OutputMsi"

if ($LASTEXITCODE -ne 0) { Write-Host "MSI 빌드 실패" -ForegroundColor Red; exit 1 }

# ── 완료 ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== 완료 ===" -ForegroundColor Green
Write-Host "MSI 파일: $OutputMsi" -ForegroundColor Yellow
