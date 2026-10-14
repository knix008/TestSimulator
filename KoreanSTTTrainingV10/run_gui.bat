@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\setup_python.bat"
if errorlevel 1 goto fail
"%PY%" "%~dp0main.py" %*
if errorlevel 1 goto fail
exit /b 0
:fail
pause
exit /b 1
