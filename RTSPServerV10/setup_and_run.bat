@echo off
setlocal

REM =================================================================
REM RTSP Server 전체 설정 및 실행 스크립트 (Windows)
REM =================================================================

echo.
echo ========================================
echo RTSP Server - 완전 자동 설정 및 실행
echo ========================================
echo.

REM =================================================================
REM 1단계: MSYS2 설치 확인
REM =================================================================
echo [1/4] MSYS2 설치 확인 중...

if not exist "C:\msys64\msys2_shell.cmd" (
    echo.
    echo [알림] MSYS2가 설치되어 있지 않습니다!
    echo        자동으로 설치를 시작합니다...
    echo.
    call install_msys2_windows.bat
    
    if errorlevel 1 (
        echo [오류] MSYS2 설치 실패
        pause
        exit /b 1
    )
)

echo    ✓ MSYS2가 설치되어 있습니다.
echo.

REM =================================================================
REM 2단계: 의존성 패키지 확인
REM =================================================================
echo [2/4] 의존성 패키지 확인 중...

C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "pkg-config --exists gtk+-3.0 && pkg-config --exists gstreamer-1.0 && pkg-config --exists gstreamer-rtsp-server-1.0" >nul 2>&1

if errorlevel 1 (
    echo.
    echo [알림] 필요한 패키지가 설치되어 있지 않습니다.
    echo        자동으로 설치를 시작합니다...
    echo.
    call install_dependencies_windows.bat
    
    if errorlevel 1 (
        echo [오류] 의존성 설치 실패
        pause
        exit /b 1
    )
) else (
    echo    ✓ 모든 의존성 패키지가 설치되어 있습니다.
    echo.
)

REM =================================================================
REM 3단계: 빌드
REM =================================================================
echo [3/4] 프로그램 빌드 확인 중...

if not exist "rtsp-server.exe" (
    echo.
    echo [알림] 실행 파일이 없습니다. 빌드를 시작합니다...
    echo.
    C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "make clean && make"
    
    if errorlevel 1 (
        echo [오류] 빌드 실패
        pause
        exit /b 1
    )
    
    echo.
    echo    ✓ 빌드 완료
) else (
    echo    ✓ 실행 파일이 존재합니다.
)

echo.

REM =================================================================
REM 4단계: 실행
REM =================================================================
echo [4/4] RTSP Server 실행 중...
echo.
echo ========================================
echo GTK 창이 열립니다...
echo 창을 닫으면 이 스크립트도 종료됩니다.
echo ========================================
echo.

C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "./rtsp-server.exe"

echo.
echo ========================================
echo 프로그램이 종료되었습니다.
echo ========================================
echo.
pause
