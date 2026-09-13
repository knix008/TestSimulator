@echo off
rem ---------------------------------------------------------------
rem uninstall.bat - removes Chunjiin Hangul Input.
rem
rem build.bat copies this file into the install folder next to
rem chunjiin.exe. It is what "Settings > Apps > Uninstall" runs, and
rem it can be double-clicked as well.
rem
rem   uninstall.bat          asks, then removes
rem   uninstall.bat /y       removes without asking
rem
rem Removes: the install folder, desktop / Start Menu shortcuts that
rem point at chunjiin.exe, and the HKCU uninstall registry entry.
rem No admin rights are needed.
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing.
rem ---------------------------------------------------------------
setlocal
set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"
set "EXE=%DIR%\chunjiin.exe"
set "KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Chunjiin"

echo ============================================================
echo  Chunjiin Hangul Input - uninstall
echo ============================================================
echo   folder : %DIR%
echo.
if /i not "%~1"=="/y" (
    choice /C YN /N /M "  Remove it? [Y/N] "
    if errorlevel 2 (
        echo   Cancelled.
        exit /b 0
    )
)

tasklist /FI "IMAGENAME eq chunjiin.exe" 2>nul | find /i "chunjiin.exe" >nul
if not errorlevel 1 (
    echo   closing chunjiin.exe ...
    taskkill /F /IM chunjiin.exe >nul 2>&1
    timeout /t 1 /nobreak >nul
)

echo   removing shortcuts ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sh = New-Object -ComObject WScript.Shell;" ^
  "foreach ($d in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {" ^
  "  if (Test-Path $d) { Get-ChildItem -Path $d -Filter '*.lnk' -File | Where-Object { $sh.CreateShortcut($_.FullName).TargetPath -ieq '%EXE%' } | Remove-Item -Force } }"

echo   removing registry entry ...
reg delete "%KEY%" /f >nul 2>&1

echo.
echo   Done. The folder %DIR%
echo   is removed a moment after this window closes.
if /i not "%~1"=="/y" (
    echo.
    pause
)

rem This script lives in that folder, so it cannot delete it while
rem running. Hand the job to a detached cmd that waits a moment,
rem and leave right away.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & rd /s /q "%DIR%""
endlocal
exit /b 0
