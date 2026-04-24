@echo off
chcp 65001 > nul
setlocal

echo ========================================
echo RTSP Server 클린 (Windows - MSYS2)
echo ========================================
echo.

REM Check if MSYS2 is installed
if not exist "C:\msys64\msys2_shell.cmd" (
    echo [오류] MSYS2가 설치되지 않았습니다.
    echo C:\msys64 경로에 MSYS2를 설치해주세요.
    echo.
    pause
    exit /b 1
)

echo [클린 시작]
echo.

REM Run make clean via MSYS2
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "make clean"

if %errorlevel% neq 0 (
    echo.
    echo [오류] 클린 실패
    pause
    exit /b 1
)

echo.
echo ========================================
echo 클린 완료!
echo ========================================
echo.
pause
