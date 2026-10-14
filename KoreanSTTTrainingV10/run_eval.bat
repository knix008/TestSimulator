@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0scripts\setup_python.bat"
if errorlevel 1 goto fail
rem Usage: run_eval.bat [FOLDER] [--model DIR] [--threshold 0.70] [--csv result.csv]
"%PY%" -m kws.evaluate %*
if errorlevel 1 goto fail
echo.
pause
exit /b 0
:fail
pause
exit /b 1
