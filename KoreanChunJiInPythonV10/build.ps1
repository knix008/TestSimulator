# build.ps1 - 바로 실행할 수 있는 실행 파일을 만든다. (Windows)
#
#   .\build.ps1              앱과 서버를 만들어 저장소 루트에 둔다
#   .\build.ps1 -Run         빌드하지 않고 소스 그대로 실행한다 (가장 빠르다)
#   .\build.ps1 -Web         빌드한 뒤 웹 판 서버까지 띄운다
#   .\build.ps1 -OneDir      한 폴더로 묶는다 (빨리 뜨지만 폴더째 옮겨야 돈다)
#
# 기본은 한 파일 묶음이다. 루트에 놓인 실행 파일 하나만 있으면 그대로
# 돌아야 하기 때문이다. 대신 처음 뜰 때 몇 초 걸린다(자기를 임시 폴더에
# 푼다). 그것이 거슬리면 -OneDir 로 만들어 dist\chunjiin\ 을 폴더째 쓴다.
#
# 파이썬은 컴파일이 없으므로 -Run 은 언제나 방금 고친 코드를 그대로 돌린다.
# .\build.ps1 로 만든 실행 파일은 그 순간의 코드를 굳힌 것이라, 고친 것을
# 보려면 다시 만들어야 한다.
#
# 설치용 파일은 이 스크립트가 만들지 않는다. scripts\package.ps1 을 쓴다.
#
# 필요한 것
#   Python 3.10 이상, PySide6            pip install PySide6
#   실행 파일을 만들려면 PyInstaller     pip install pyinstaller

[CmdletBinding()]
param(
    [switch]$Run,
    [switch]$Web,
    [switch]$OneDir
)

# PowerShell 5.1 은 네이티브 exe 가 stderr 로 찍은 줄을 오류로 잘못 읽는다.
# ErrorActionPreference 를 Stop 으로 두면 PyInstaller 가 진행 상황을 찍는
# 것만으로 스크립트가 멈춘다. 그래서 Continue 로 두고, 성공 여부는 언제나
# $LASTEXITCODE 로 직접 본다.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

# 있는 것을 찾는 것으로는 모자라다. Windows 의 python3 은 스토어로 데려가는
# 껍데기일 때가 있어서, 부르면 아무것도 하지 않고 끝난다. 그래서 정말로
# 도는지, 3.10 이상인지 실제로 물어 본다.
$check = 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'
$python = $null
foreach ($name in @('python', 'py', 'python3')) {
    $found = (Get-Command $name -ErrorAction SilentlyContinue).Source
    if (-not $found) { continue }
    & $found -c $check *> $null
    if ($LASTEXITCODE -eq 0) { $python = $found; break }
}
if (-not $python) {
    Write-Host '파이썬 3.10 이상을 찾지 못했습니다.' -ForegroundColor Red
    exit 1
}

# -Run 은 묶지 않고 소스를 그대로 돌린다. 고친 것이 바로 보인다.
if ($Run) {
    Write-Host "== 소스 그대로 실행  ($(& $python --version))"
    & $python -m chunjiin
    exit $LASTEXITCODE
}

Write-Host '== 천지인 한글 입력기 빌드'
Write-Host "   $(& $python --version)"

& $python -c 'import PyInstaller' *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'PyInstaller 가 없습니다. 아래를 먼저 하세요.' -ForegroundColor Yellow
    Write-Host "   $python -m pip install pyinstaller"
    exit 1
}

$mode = if ($OneDir) { '--onedir' } else { '--onefile' }

Write-Host "-- 데스크톱 앱 · 서버  ($mode)"
# 한 파일로 만든 것만 루트에 놓는다. 한 폴더 묶음은 실행 파일만 떼어
# 놓으면 딸린 파일이 없어 돌지 않는다.
& $python scripts\pyinstaller_build.py $mode --copy-root --targets app serve
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '== 빌드 완료'

if ($Web) {
    Write-Host '-- 웹 판 서버'
    & $python -m chunjiin.web
}
