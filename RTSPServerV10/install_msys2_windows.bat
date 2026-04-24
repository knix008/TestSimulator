@echo off
REM =================================================================
REM MSYS2 자동 설치 스크립트 (Windows)
REM =================================================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo MSYS2 자동 설치
echo ========================================
echo.

REM MSYS2가 이미 설치되어 있는지 확인
if exist "C:\msys64\msys2_shell.cmd" (
    echo [알림] MSYS2가 이미 C:\msys64에 설치되어 있습니다.
    echo.
    choice /C YN /M "재설치하시겠습니까"
    if errorlevel 2 (
        echo 설치를 건너뜁니다.
        exit /b 0
    )
)

echo.
echo MSYS2 설치 방법을 선택하세요:
echo.
echo 1. winget으로 자동 설치 (권장 - Windows 10/11)
echo 2. 수동 설치 안내
echo.
choice /C 12 /N /M "선택 (1 또는 2): "
set INSTALL_METHOD=%errorlevel%

if %INSTALL_METHOD%==1 goto INSTALL_WINGET
if %INSTALL_METHOD%==2 goto MANUAL_INSTALL

:INSTALL_WINGET
echo.
echo [winget으로 MSYS2 설치 중...]
echo.

REM winget 사용 가능 여부 확인
winget --version >nul 2>&1
if errorlevel 1 (
    echo [오류] winget을 사용할 수 없습니다.
    echo.
    echo winget은 Windows 10 버전 1809 이상 또는 Windows 11에서 사용 가능합니다.
    echo Microsoft Store에서 "앱 설치 관리자"를 설치하거나 업데이트하세요.
    echo.
    echo https://apps.microsoft.com/store/detail/9NBLGGH4NNS1
    echo.
    goto MANUAL_INSTALL
)

echo winget을 사용하여 MSYS2를 설치합니다...
echo 이 작업은 몇 분 정도 걸릴 수 있습니다.
echo.

REM MSYS2 설치
winget install --id MSYS2.MSYS2 --silent --accept-package-agreements --accept-source-agreements

if errorlevel 1 (
    echo.
    echo [오류] winget을 통한 설치가 실패했습니다.
    echo.
    goto MANUAL_INSTALL
)

echo.
echo ========================================
echo ✓ MSYS2 설치 완료!
echo ========================================
echo.
echo 설치 위치: C:\msys64
echo.
echo 다음 단계:
echo 1. 의존성 패키지 설치: install_dependencies_windows.bat
echo 2. 프로그램 빌드: build_windows.bat
echo 3. 프로그램 실행: run.bat
echo.
echo 또는 setup_and_run.bat를 실행하여 모든 작업을 자동으로 수행하세요.
echo.
pause
exit /b 0

:MANUAL_INSTALL
echo.
echo ========================================
echo 수동 설치 안내
echo ========================================
echo.
echo MSYS2를 수동으로 설치하려면:
echo.
echo 1. 브라우저에서 다음 주소를 방문하세요:
echo    https://www.msys2.org/
echo.
echo 2. "msys2-x86_64-latest.exe" 다운로드
echo.
echo 3. 다운로드한 파일 실행
echo.
echo 4. 설치 경로를 C:\msys64로 설정 (기본값)
echo.
echo 5. 설치 완료 후 이 스크립트를 다시 실행하거나
echo    install_dependencies_windows.bat를 실행하세요.
echo.
echo 브라우저에서 MSYS2 다운로드 페이지를 여시겠습니까?
choice /C YN /M "열기 (Y/N)"
if not errorlevel 2 (
    start https://www.msys2.org/
)
echo.
pause
exit /b 1
