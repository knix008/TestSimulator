@echo off
setlocal
cd /d "%~dp0.."

echo [1/2] 앱 퍼블리시 중...
dotnet publish -p:PublishProfile=SingleFile
if errorlevel 1 (
    echo 퍼블리시 실패
    exit /b 1
)

echo [2/2] MSI 빌드 중...
cd Setup
wix build Package.wxs ^
    -ext WixToolset.UI.wixext ^
    -ext WixToolset.Util.wixext ^
    -culture ko-KR ^
    -out ..\bin\Release\publish\PandocWinV2.0.msi
cd ..
if errorlevel 1 (
    echo MSI 빌드 실패
    exit /b 1
)

echo.
echo 완료: bin\Release\publish\PandocWinV2.0.msi
endlocal
