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
echo Starting Windows agent HTTP on 0.0.0.0:9511
mmon-agent.exe --http 0.0.0.0:9511 %*
