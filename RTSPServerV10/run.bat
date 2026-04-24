@echo off
REM RTSP Server 실행 스크립트 (Windows)

echo ========================================
echo RTSP Server 실행
echo ========================================
echo.

REM 실행 파일 확인
if not exist "rtsp-server.exe" (
    echo [오류] rtsp-server.exe 파일이 없습니다!
    echo.
    echo 먼저 빌드를 실행하세요:
    echo   build_windows.bat
    echo.
    echo 또는 MSYS2 MinGW 64-bit 터미널에서:
    echo   make
    echo.
    pause
    exit /b 1
)

REM MSYS2 설치 확인
if not exist "C:\msys64\msys2_shell.cmd" (
    echo [오류] MSYS2가 설치되어 있지 않습니다!
    echo.
    echo MSYS2를 먼저 설치해주세요:
    echo https://www.msys2.org/
    pause
    exit /b 1
)

echo [실행 중...]
echo GTK 창이 열립니다...
echo.

REM MSYS2 환경에서 실행
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "./rtsp-server.exe"

echo.
echo 프로그램이 종료되었습니다.
pause
