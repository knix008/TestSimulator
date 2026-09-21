@echo off
setlocal
cd /d "%~dp0..\dist\windows"
if "%~1"=="" (
  echo Usage: connect.bat host:port
  echo Example: connect.bat 192.168.0.10:9510
  exit /b 1
)
mmon-agent.exe --connect %*
