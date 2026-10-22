@echo off
rem Usage: build.cmd [-Release] [-NoMsi] [-Clean] [-Run] [-Stop]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
exit /b %ERRORLEVEL%
