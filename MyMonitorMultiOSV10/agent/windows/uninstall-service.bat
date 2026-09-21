@echo off
setlocal
cd /d "%~dp0..\dist\windows"
mmon-agent.exe --service uninstall
netsh advfirewall firewall delete rule name="MyMonitor Agent" >nul 2>&1
echo Service removed.
