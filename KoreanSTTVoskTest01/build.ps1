<#
build.ps1

Windows 빌드 스크립트. MSYS2 의 MINGW64(MSVCRT 계열) g++ 를 쓴다 — Vosk 공식
Windows 빌드와 같은 계열이어야 libvosk.dll 이 GTK 와 한 프로세스에서 같이 뜬다.

사용법:
  .\build.ps1
  .\build.ps1 -Debug
  .\build.ps1 -Clean         # 산출물을 지우고 처음부터 (clean.ps1 과 같은 범위)
  .\build.ps1 -Gui gtk4      # GTK4 판 (기본은 Win32 네이티브)
  .\build.ps1 -Gui all       # 둘 다
  .\build.ps1 -NoGui
#>
# CmdletBinding 을 쓰지 않는다: 그러면 -Debug 가 PowerShell 공용 매개변수와 충돌해
# ("ParameterNameAlreadyExistsForCommand") 스크립트가 아예 실행되지 않는다.
param(
    [switch]$Debug,
    [switch]$Clean,
    [switch]$NoGui,
    [ValidateSet('native', 'gtk4', 'all', 'none')]
    [string]$Gui = 'native'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$buildDir = Join-Path $root 'build'

function Say([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }

# --- MSYS2 MINGW64 찾기 ---
$msysRoot = $env:MSYS2_ROOT
if (-not $msysRoot) {
    foreach ($candidate in @('C:\Msys64', 'C:\msys64', 'C:\tools\msys64')) {
        if (Test-Path $candidate) { $msysRoot = $candidate; break }
    }
}
if (-not $msysRoot) { throw "MSYS2 를 찾을 수 없습니다. 먼저 .\fetch_deps.ps1 을 보세요." }

$mingwBin = Join-Path $msysRoot 'mingw64\bin'
if (-not (Test-Path (Join-Path $mingwBin 'g++.exe'))) {
    throw "MINGW64 g++ 가 없습니다. .\fetch_deps.ps1 -InstallSystemDeps 를 실행하세요."
}

$env:PATH = "$mingwBin;$env:PATH"
$env:CXX = Join-Path $mingwBin 'g++.exe'
Say "컴파일러: $env:CXX"

# cmake 는 MSYS2 것이든 따로 설치한 것이든 상관없다.
$cmake = (Get-Command cmake -ErrorAction SilentlyContinue)
if (-not $cmake) { throw "cmake 가 없습니다." }

if ($Clean) {
    # 실행 파일이 루트에 놓이므로 build\ 만 지워서는 부족하다.
    & (Join-Path $PSScriptRoot 'clean.ps1')
}

$buildType = if ($Debug) { 'Debug' } else { 'Release' }
$gui = if ($NoGui) { 'none' } else { $Gui }

$generator = @()
if (Get-Command ninja -ErrorAction SilentlyContinue) { $generator = @('-G', 'Ninja') }

Say "구성 ($buildType, GUI=$gui)"
& cmake -S $root -B $buildDir @generator `
    "-DCMAKE_BUILD_TYPE=$buildType" `
    "-DKSTT_GUI=$gui" `
    "-DCMAKE_CXX_COMPILER=$($env:CXX -replace '\\','/')"
if ($LASTEXITCODE -ne 0) { throw "CMake 구성이 실패했습니다" }

Say "빌드"
& cmake --build $buildDir --parallel
if ($LASTEXITCODE -ne 0) { throw "빌드가 실패했습니다" }

Say "만들어진 실행 파일 (프로젝트 루트)"
Get-ChildItem $root -Filter 'kstt-*.exe' | ForEach-Object { Write-Host "    $($_.Name)" }

Say "끝났습니다. 다음: .\run.ps1 (GUI) 또는 .\test.ps1"
