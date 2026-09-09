# test.ps1 - 시험을 돌리고 구역별로 정리해서 보여 준다. (Windows)
#
#   .\test.ps1              구역별 집계와 요약
#   .\test.ps1 -Detail      항목마다 한 줄씩
#   .\test.ps1 -Run 낱말    이름이 맞는 것만
#
# 무엇을 보는가
#   tests\test_cases.py   엔진 회귀 시험. KoreanChunJiInC++ 의 tests/test_engine.c
#                         에서 뽑아 온 430항목(test\cases.tsv).
#   tests\test_engine.py  자료로 뽑을 수 없는 항목 - 영문 26자 전수,
#                         라벨-입력 일치, 원본 함수 직접 확인, 경계·예외.
#   tests\test_ui.py      색표 · 설정 · 배치 · 커서 변환 · 언어 · 그림,
#                         그리고 창까지 만들어 보는 스모크 시험.
#   tests\test_web.py     서버 경로 처리, 상태 객체, 실제로 띄워 두드려 보기.
#
# pytest 를 깔지 않아도 된다. tests\report.py 가 시험을 찾아 돌리고
# 결과를 모아 정리한다.

[CmdletBinding()]
param(
    [switch]$Detail,
    [string]$Run
)

# PowerShell 5.1 은 네이티브 exe 가 stderr 로 찍은 줄을 오류로 잘못 읽는다.
# ErrorActionPreference 를 Stop 으로 두면 PyInstaller 가 진행 상황을 찍는
# 것만으로 스크립트가 멈춘다. 그래서 Continue 로 두고, 성공 여부는 언제나
# $LASTEXITCODE 로 직접 본다.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

# 한글이 물음표로 나오지 않게 콘솔과 파이썬을 모두 UTF-8 로 맞춘다.
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

# 창을 띄우지 않고 그린다. 화면이 없는 자리에서도 돌게 한다.
#
# .	est.ps1 은 **지금 이 PowerShell 프로세스 안에서** 돈다. 그래서 여기서
# $env: 를 건드리면 시험이 끝난 뒤에도 그 창에 남는다. 그 상태로 앱을 띄우면
# 창이 뜨지 않고 Qt 가 "Cannot find font directory" 라고 나무란다.
# 실제로 그렇게 헷갈렸다. 그러니 끝나면 반드시 되돌린다.
$hadPlatform = Test-Path Env:\QT_QPA_PLATFORM
$oldPlatform = if ($hadPlatform) { $env:QT_QPA_PLATFORM } else { $null }
if (-not $hadPlatform) { $env:QT_QPA_PLATFORM = 'offscreen' }

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

$argv = @('-m', 'tests.report')
if ($Detail) { $argv += '-v' }
if ($Run)    { $argv += @('-run', $Run) }

try {
    & $python @argv
    $code = $LASTEXITCODE
} finally {
    if ($hadPlatform) {
        $env:QT_QPA_PLATFORM = $oldPlatform
    } else {
        Remove-Item Env:\QT_QPA_PLATFORM -ErrorAction SilentlyContinue
    }
}
exit $code
