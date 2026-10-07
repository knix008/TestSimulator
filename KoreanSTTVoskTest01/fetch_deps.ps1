<#
fetch_deps.ps1

Windows 에서 외부 의존물을 받아 둔다.
  1) libvosk (vosk-win64)            -> third_party\
  2) Vosk 한국어 모델                -> models\
  3) MSYS2 MINGW64 툴체인과 GTK4     -> pacman (-InstallSystemDeps 를 줄 때만)

왜 MINGW64(MSVCRT)인가: Vosk 공식 Windows 빌드가 MSVCRT 계열 MinGW 로 만들어져
있다. UCRT64 로 빌드하면 GTK 가 끌어오는 UCRT 판 libstdc++ 와 Vosk 가 쓰는 MSVCRT
판이 한 프로세스에서 부딪혀 libvosk.dll 적재가 실패한다.

사용법:
  .\fetch_deps.ps1
  .\fetch_deps.ps1 -InstallSystemDeps
  .\fetch_deps.ps1 -Model <모델 이름>

2026-10 기준 한국어 모델은 vosk-model-small-ko-0.22 하나뿐이다. -Model 에는
모델 이름을 그대로 적는다 (다른 언어 모델도 받을 수 있다).
#>
[CmdletBinding()]
param(
    [switch]$InstallSystemDeps,
    [string]$Model = 'small',
    [string]$VoskVersion = '0.3.45'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Say([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Warn([string]$text) { Write-Host "경고: $text" -ForegroundColor Yellow }

$modelName = if ($Model -in @('small', 'ko')) { 'vosk-model-small-ko-0.22' } else { $Model }
$voskPkg = "vosk-win64-$VoskVersion"

# ---------------------------------------------------------------- libvosk
$thirdParty = Join-Path $root 'third_party'
New-Item -ItemType Directory -Force -Path $thirdParty | Out-Null

if (Test-Path (Join-Path $thirdParty $voskPkg)) {
    Say "libvosk 가 이미 있습니다: third_party\$voskPkg"
} else {
    Say "libvosk 를 받습니다 ($voskPkg)"
    $zip = Join-Path $thirdParty "$voskPkg.zip"
    $url = "https://github.com/alphacep/vosk-api/releases/download/v$VoskVersion/$voskPkg.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $thirdParty -Force
    Remove-Item $zip -Force
    Get-ChildItem (Join-Path $thirdParty $voskPkg) | Select-Object -ExpandProperty Name
}

# ---------------------------------------------------------------- 한국어 모델
$models = Join-Path $root 'models'
New-Item -ItemType Directory -Force -Path $models | Out-Null

if (Test-Path (Join-Path $models $modelName)) {
    Say "모델이 이미 있습니다: models\$modelName"
} else {
    Say "모델을 받습니다 ($modelName, 한국어 small 은 내려받기 83MB · 풀면 253MB)"
    $zip = Join-Path $models "$modelName.zip"
    Invoke-WebRequest -Uri "https://alphacephei.com/vosk/models/$modelName.zip" `
        -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $models -Force
    Remove-Item $zip -Force
}

# ---------------------------------------------------------------- MSYS2 / GTK4
$msysRoot = $env:MSYS2_ROOT
if (-not $msysRoot) {
    foreach ($candidate in @('C:\Msys64', 'C:\msys64', 'C:\tools\msys64')) {
        if (Test-Path $candidate) { $msysRoot = $candidate; break }
    }
}

$packages = @(
    'mingw-w64-x86_64-gcc',
    'mingw-w64-x86_64-gtk4',
    'mingw-w64-x86_64-pkgconf',
    'mingw-w64-x86_64-cmake',
    'mingw-w64-x86_64-ninja'
)

if (-not $msysRoot) {
    Warn "MSYS2 를 찾을 수 없습니다. https://www.msys2.org 에서 설치한 뒤 다시 실행하세요."
    Write-Host "  설치 후: pacman -S --needed $($packages -join ' ')"
} else {
    $pacman = Join-Path $msysRoot 'usr\bin\pacman.exe'
    if ($InstallSystemDeps) {
        Say "MSYS2 패키지를 설치합니다 ($msysRoot)"
        & $pacman -S --needed --noconfirm @packages
        if ($LASTEXITCODE -ne 0) { throw "pacman 설치가 실패했습니다 (코드 $LASTEXITCODE)" }
    } else {
        Say "필요한 MSYS2 패키지 (아직 없다면 -InstallSystemDeps 를 주세요):"
        Write-Host "  & '$pacman' -S --needed $($packages -join ' ')"
    }
}

Say "끝났습니다. 다음: .\build.ps1"
