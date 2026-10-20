@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0clean.ps1" %*
exit /b %ERRORLEVEL%
