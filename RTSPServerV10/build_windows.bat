@echo off
REM Windows에서 RTSP Server 빌드 스크립트

echo ========================================
echo RTSP Server 빌드 (Windows - MSYS2)
echo ========================================
echo.

REM MSYS2 설치 확인
if not exist "C:\msys64\msys2_shell.cmd" (
    echo [오류] MSYS2가 설치되어 있지 않습니다!
    echo install_dependencies_windows.bat을 먼저 실행하세요.
    pause
    exit /b 1
)

echo [빌드 시작]
echo.

REM 빌드 실행
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "make clean && make"

if errorlevel 1 (
    echo.
    echo [오류] 빌드 실패
    pause
    exit /b 1
)

echo.
echo ========================================
echo 빌드 완료!
echo ========================================
echo.
echo 실행 방법:
echo 1. MSYS2 MinGW 64-bit 터미널에서:
echo    ./rtsp-server.exe
echo.
echo 또는
echo.
echo 2. 이 창에서 실행하려면 아무 키나 누르세요...
pause

echo.
echo [실행 중...]
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "./rtsp-server.exe"
