@echo off
rem Usage: build.cmd [-Debug] [-NoMsi] [-Clean] [-Run] [-Stop]
rem Default: Release build + installer, DeskSearchSetup*.msi copied to this folder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
exit /b %ERRORLEVEL%
