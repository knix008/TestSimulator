@echo off
setlocal
cd /d "%~dp0..\dist\windows"
if not exist mmon-agent.exe (
  echo mmon-agent.exe not found. Build first:
  echo   cd agent
  echo   cmake -B build
  echo   cmake --build build --config Release
  exit /b 1
)
echo Starting Windows agent on 0.0.0.0:9510
mmon-agent.exe --listen 0.0.0.0:9510 %*
