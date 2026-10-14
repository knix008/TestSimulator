@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0scripts\setup_python.bat"
if errorlevel 1 goto fail
if "%~1"=="" (
  echo Usage: run_record.bat LABEL [COUNT]
  echo Example: run_record.bat 출근 5
  echo          run_record.bat 무음 6
  goto fail
)
"%PY%" -m kws.record %*
if errorlevel 1 goto fail
echo.
pause
exit /b 0
:fail
pause
exit /b 1
