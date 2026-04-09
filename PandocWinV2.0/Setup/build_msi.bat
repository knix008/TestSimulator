@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "ROOT=%CD%"
set "OUT=%ROOT%\bin\Release\publish"
set "MSI=%OUT%\PandocWinV2.0.msi"

echo WiX SDK 프로젝트 빌드 중 ^(앱 퍼블리시 + MSI^)...
dotnet build "%ROOT%\Setup\PandocWinV2.0.Setup.csproj" -c Release -v minimal
if errorlevel 1 (
    echo MSI 빌드 실패 ^(WiX MSBuild SDK 6.x, .NET 10 SDK 필요^)
    exit /b 1
)

if not exist "%MSI%" (
    echo [오류] "%MSI%" 가 생성되지 않았습니다.
    exit /b 1
)

echo.
echo 완료: %MSI%
endlocal
