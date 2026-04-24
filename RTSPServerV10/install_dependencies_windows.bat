@echo off
REM RTSP Server 의존성 설치 스크립트 (Windows - MSYS2)

echo ========================================
echo RTSP Server 의존성 설치 (Windows)
echo ========================================
echo.

REM MSYS2 설치 확인
if not exist "C:\msys64\msys2_shell.cmd" (
    echo [알림] MSYS2가 설치되어 있지 않습니다!
    echo.
    echo MSYS2를 자동으로 설치하시겠습니까?
    choice /C YN /M "자동 설치 (Y/N)"
    if errorlevel 2 (
        echo.
        echo MSYS2 수동 설치 방법:
        echo 1. https://www.msys2.org/ 방문
        echo 2. msys2-x86_64-latest.exe 다운로드
        echo 3. 설치 (기본 경로: C:\msys64)
        echo.
        pause
        exit /b 1
    )
    
    echo.
    echo MSYS2 설치를 시작합니다...
    call install_msys2_windows.bat
    
    if errorlevel 1 (
        echo [오류] MSYS2 설치 실패
        pause
        exit /b 1
    )
    
    echo.
    echo MSYS2 설치가 완료되었습니다. 의존성 패키지 설치를 계속합니다...
    echo.
)

echo [1/3] MSYS2가 감지되었습니다.
echo.

REM 패키지 데이터베이스 업데이트
echo [2/3] 패키지 데이터베이스 업데이트 중...
echo.
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "pacman -Sy --noconfirm"

if errorlevel 1 (
    echo [오류] 패키지 데이터베이스 업데이트 실패
    pause
    exit /b 1
)

echo.
echo [3/3] 개발 도구 및 라이브러리 설치 중...
echo 이 작업은 시간이 걸릴 수 있습니다 (5-10분)...
echo.

REM 필요한 패키지 설치
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "pacman -S --noconfirm --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-make mingw-w64-x86_64-pkg-config mingw-w64-x86_64-gtk3 mingw-w64-x86_64-gstreamer mingw-w64-x86_64-gst-plugins-base mingw-w64-x86_64-gst-plugins-good mingw-w64-x86_64-gst-plugins-bad mingw-w64-x86_64-gst-plugins-ugly mingw-w64-x86_64-gst-libav mingw-w64-x86_64-gst-rtsp-server"

if errorlevel 1 (
    echo.
    echo [오류] 패키지 설치 실패
    pause
    exit /b 1
)

echo.
echo ========================================
echo 설치 완료!
echo ========================================
echo.
echo 설치된 패키지:
echo - GCC 컴파일러
echo - Make 빌드 도구
echo - pkg-config
echo - GTK3 GUI 라이브러리
echo - GStreamer 멀티미디어 프레임워크
echo - GStreamer 플러그인 (base, good, bad, ugly)
echo - GStreamer RTSP 서버 라이브러리
echo.
echo 빌드 방법:
echo 1. MSYS2 MinGW 64-bit 터미널 열기
echo 2. cd /d/Home/Projects/TestSimulator/RTSPServerV10
echo 3. make
echo 4. ./rtsp-server.exe
echo.
pause
