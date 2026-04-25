@echo off
REM RTSP Server 빌드 배치 스크립트
REM Windows 명령 프롬프트용

echo =====================================
echo RTSP Server 빌드 및 배포
echo =====================================
echo.

REM 관리자 권한 확인
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] 관리자 권한으로 실행 중
) else (
    echo [WARNING] 관리자 권한이 아닙니다.
    echo [WARNING] 일부 기능이 제한될 수 있습니다.
)
echo.

REM PowerShell 스크립트 실행
echo PowerShell 빌드 스크립트 실행 중...
powershell -ExecutionPolicy Bypass -File "%~dp0Build.ps1" %*

if %errorLevel% == 0 (
    echo.
    echo [SUCCESS] 빌드 완료!
) else (
    echo.
    echo [ERROR] 빌드 실패! 오류 코드: %errorLevel%
    pause
    exit /b %errorLevel%
)

echo.
pause
