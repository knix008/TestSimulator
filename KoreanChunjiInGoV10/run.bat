@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input - run the desktop app
rem
rem   run.bat               start chunjiin.exe
rem                         (builds it first if it is missing)
rem
rem Double-click this file, or run it from a console.
rem The same thing in PowerShell: run.ps1
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing.
rem ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

if not exist chunjiin.exe (
    echo chunjiin.exe is missing. Building first...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
    if errorlevel 1 (
        echo BUILD FAILED
        exit /b 1
    )
    if not exist chunjiin.exe (
        echo chunjiin.exe was not created
        exit /b 1
    )
)

echo starting chunjiin.exe
start "" "%CD%\chunjiin.exe"
endlocal
exit /b 0
