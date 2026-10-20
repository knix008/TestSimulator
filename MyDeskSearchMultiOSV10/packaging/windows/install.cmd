@echo off
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0install.ps1"
exit /b %ERRORLEVEL%
