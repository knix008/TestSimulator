@echo off
rem Double-clickable wrapper so the script runs whatever the machine's execution policy is.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
if errorlevel 1 pause
