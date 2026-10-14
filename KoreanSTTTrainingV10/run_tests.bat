@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0scripts\setup_python.bat"
if errorlevel 1 goto fail
"%PY%" -m unittest discover -s test -t . -v %*
if errorlevel 1 goto fail
echo.
pause
exit /b 0
:fail
pause
exit /b 1
