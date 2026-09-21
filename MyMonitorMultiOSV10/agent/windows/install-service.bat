@echo off
setlocal
cd /d "%~dp0..\dist\windows"
if not exist mmon-agent.exe (
  echo Build the Windows agent first.
  exit /b 1
)
echo Installing MyMonitorAgent Windows service (Administrator required)
mmon-agent.exe --service install --listen 0.0.0.0:9510
if errorlevel 1 exit /b 1
netsh advfirewall firewall delete rule name="MyMonitor Agent" >nul 2>&1
netsh advfirewall firewall add rule name="MyMonitor Agent" dir=in action=allow protocol=TCP localport=9510
sc start MyMonitorAgent
echo Service installed and started. Port 9510 is open inbound.
