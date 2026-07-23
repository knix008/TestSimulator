@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo ============================================================
echo  3D Architecture Viewer - AI Python 환경 설정
echo ============================================================
echo.

:: ── Python 확인 ─────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo        https://www.python.org/downloads/ 에서 설치하세요.
    echo        설치 시 "Add Python to PATH" 옵션을 체크하세요.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK] %PY_VER% 감지됨

:: ── pip 확인 ────────────────────────────────────────────────
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [오류] pip을 찾을 수 없습니다.
    pause
    exit /b 1
)
echo [OK] pip 감지됨

:: ── 가상환경 선택 ────────────────────────────────────────────
set VENV_DIR=%~dp0.venv
set USE_VENV=Y

echo.
echo 가상환경(venv)을 생성하시겠습니까? (Y/n)
echo   Y: %VENV_DIR% 에 격리된 환경 생성 (권장)
echo   N: 시스템 Python에 전역 설치
set /p USE_VENV="선택 [Y]: "
if "!USE_VENV!"=="" set USE_VENV=Y

if /i "!USE_VENV!"=="Y" (
    if not exist "%VENV_DIR%" (
        echo.
        echo [진행] 가상환경 생성 중...
        python -m venv "%VENV_DIR%"
        if errorlevel 1 (
            echo [오류] 가상환경 생성 실패
            pause
            exit /b 1
        )
    ) else (
        echo [OK] 기존 가상환경 재사용: %VENV_DIR%
    )
    set PIP="%VENV_DIR%\Scripts\pip.exe"
    set PYTHON="%VENV_DIR%\Scripts\python.exe"
) else (
    set PIP=python -m pip
    set PYTHON=python
)

:: ── 패키지 설치 ──────────────────────────────────────────────
echo.
echo [진행] 패키지 설치 중 (requirements.txt)...
%PIP% install --upgrade pip --quiet
%PIP% install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo.
    echo [오류] 패키지 설치 실패. 오류 내용을 확인하세요.
    pause
    exit /b 1
)

:: ── 설치 검증 ────────────────────────────────────────────────
echo.
echo [진행] 설치 검증 중...
%PYTHON% -c "import flask, flask_cors, onnxruntime, PIL, numpy; print('OK')" >nul 2>&1
if errorlevel 1 (
    echo [경고] 일부 패키지 검증 실패. 서버 기능이 제한될 수 있습니다.
) else (
    echo [OK] 모든 핵심 패키지 정상 설치됨
)

%PYTHON% -c "from PyQt5.QtWidgets import QApplication; print('OK')" >nul 2>&1
if errorlevel 1 (
    echo [정보] PyQt5 시스템 트레이 비활성 (헤드리스 모드로 실행됩니다)
) else (
    echo [OK] PyQt5 정상 설치됨
)

:: ── 실행 스크립트 생성 ───────────────────────────────────────
set START_BAT=%~dp0start_server.bat
if /i "!USE_VENV!"=="Y" (
    echo @echo off > "%START_BAT%"
    echo echo AI 서버 시작 중... >> "%START_BAT%"
    echo "%VENV_DIR%\Scripts\python.exe" "%%~dp0ai_server.py" >> "%START_BAT%"
) else (
    echo @echo off > "%START_BAT%"
    echo echo AI 서버 시작 중... >> "%START_BAT%"
    echo python "%%~dp0ai_server.py" >> "%START_BAT%"
)

echo.
echo ============================================================
echo  설정 완료!
echo.
echo  AI 서버 실행:  python\start_server.bat
echo  또는 직접:     %PYTHON% python\ai_server.py
echo.
echo  Electron 앱을 실행하면 AI 서버가 자동으로 시작됩니다.
echo ============================================================
echo.
pause
