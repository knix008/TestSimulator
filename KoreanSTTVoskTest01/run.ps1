<#
run.ps1

빌드한 프로그램을 띄운다. GTK 런타임(mingw64)과 libvosk, 모델 경로를 맞춰 준다.

사용법:
  .\run.ps1                              # 기본 GUI (Win32 네이티브)
  .\run.ps1 gui-gtk4                     # GTK4 판 (따로 빌드했을 때)
  .\run.ps1 cli --list-devices
  .\run.ps1 cli --wav tests\data\sample-ko.wav
  .\run.ps1 tests
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('gui', 'gui-native', 'gui-gtk4', 'cli', 'tests')]
    [string]$Target = 'gui',

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$bin = $root   # 실행 파일은 프로젝트 루트에 놓인다

# 프로그램은 UTF-8 로 출력한다. Windows PowerShell 5.1 은 자식 프로세스 출력을
# 기본적으로 ANSI 코드페이지(한국어 Windows 는 949)로 읽어 한글이 깨지므로,
# 읽는 쪽 인코딩을 UTF-8 로 맞춰 준다.
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    # 콘솔이 없는 환경(IDE 등)에서는 조용히 넘어간다.
}

function Say([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }

$exe = Join-Path $bin "kstt-$Target.exe"
if (-not (Test-Path $exe)) { throw "$exe 가 없습니다. 먼저 .\build.ps1 을 실행하세요." }

$msysRoot = $env:MSYS2_ROOT
if (-not $msysRoot) {
    foreach ($candidate in @('C:\Msys64', 'C:\msys64', 'C:\tools\msys64')) {
        if (Test-Path $candidate) { $msysRoot = $candidate; break }
    }
}
if ($msysRoot) { $env:PATH = "$bin;$(Join-Path $msysRoot 'mingw64\bin');$env:PATH" }
else { $env:PATH = "$bin;$env:PATH" }

if (-not $env:KSTT_MODEL) {
    $model = Get-ChildItem (Join-Path $root 'models') -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like '*ko*' } | Select-Object -First 1
    if ($model) { $env:KSTT_MODEL = $model.FullName }
}

$suffix = if ($env:KSTT_MODEL) { " (모델 $(Split-Path -Leaf $env:KSTT_MODEL))" } else { '' }
Say "실행: kstt-$Target$suffix"

if ($Rest) { & $exe @Rest } else { & $exe }
exit $LASTEXITCODE
