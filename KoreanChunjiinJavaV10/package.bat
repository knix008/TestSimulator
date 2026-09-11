@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input (Java) - installer builder for cmd.exe
rem
rem   package.bat               installer, Chunjiin-1.0.0.exe
rem   package.bat -portable     a zip you unpack and run, no installer
rem   package.bat -type msi     pick the kind (exe, msi, app-image)
rem   package.bat -nowix        do not fetch WiX; stop instead
rem   package.bat -pause        wait for a key before closing
rem   package.bat -h            help
rem
rem This is a thin wrapper over package.ps1. Finding a JDK, building,
rem fetching WiX, jlink and jpackage all happen there, so the two can
rem never drift apart.
rem
rem exe and msi need WiX Toolset 3.14. package.ps1 downloads it into
rem tools\wix314 by itself - no admin rights and no .NET 3.5 needed.
rem The first run therefore pulls about 40 MB.
rem
rem The result lands in release\ and is copied to the project root.
rem
rem There is no automatic "press a key" at the end, so double-clicking
rem this in Explorer shows the result and then closes the window. That
rem is on purpose: Explorer starts us as
rem   cmd /c ""...\package.bat" "
rem and a script or a CI job calling us starts us the same way, so the
rem two cannot be told apart. Guessing wrong would hang the build. Pass
rem -pause, or make a shortcut to
rem   cmd /k "...\package.bat"
rem if you want the window to stay.
rem
rem Exit code is 0 when the installer was built, non-zero otherwise.
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing. The
rem       build itself prints Korean; that comes out of package.ps1,
rem       which this script runs with the console set to UTF-8.
rem ---------------------------------------------------------------

setlocal EnableDelayedExpansion

set HOLD=

if /i "%~1"=="-h"     goto :usage
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="/?"     goto :usage

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo powershell.exe not found on PATH.
    echo Windows PowerShell ships with Windows; look in
    echo   C:\Windows\System32\WindowsPowerShell\v1.0
    set RESULT=1
    goto :done
)

if not exist "%~dp0package.ps1" (
    echo package.ps1 is missing next to this file.
    echo   %~dp0package.ps1
    set RESULT=1
    goto :done
)

rem Take the shell spellings as well as the PowerShell ones, so that
rem --portable, -portable and -Portable all reach package.ps1 the way
rem it wants them. -type is followed by its value, which passes through
rem untouched on the next turn of the loop.
set ARGS=
:parse
if "%~1"=="" goto :parsed
set "A=%~1"
if /i "!A!"=="-pause"     (set HOLD=1) & shift & goto :parse
if /i "!A!"=="--pause"    (set HOLD=1) & shift & goto :parse
if /i "!A!"=="--portable" set "A=-Portable"
if /i "!A!"=="-portable"  set "A=-Portable"
if /i "!A!"=="--no-wix"   set "A=-NoWix"
if /i "!A!"=="--nowix"    set "A=-NoWix"
if /i "!A!"=="-nowix"     set "A=-NoWix"
if /i "!A!"=="--type"     set "A=-Type"
if /i "!A!"=="-type"      set "A=-Type"
set "ARGS=!ARGS! !A!"
shift
goto :parse
:parsed

rem The build prints Korean, so switch the console to UTF-8 first.
rem `chcp` answers "Active code page: 949." - strip the space and the
rem full stop or the restore at the end fails.
set OLDCP=
for /f "tokens=2 delims=:" %%p in ('chcp') do set "OLDCP=%%p"
set "OLDCP=%OLDCP: =%"
set "OLDCP=%OLDCP:.=%"
chcp 65001 >nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0package.ps1"%ARGS%
set RESULT=%ERRORLEVEL%

if defined OLDCP chcp %OLDCP% >nul

if "%RESULT%"=="0" (
    echo.
    echo PACKAGE BUILT  ^(see release\ and the project root^)
) else (
    echo.
    echo PACKAGE FAILED  ^(exit code %RESULT%^)
)
goto :done

:usage
echo Chunjiin Hangul Input ^(Java^) - installer builder
echo.
echo   package.bat               installer, Chunjiin-1.0.0.exe
echo   package.bat -portable     a zip you unpack and run, no installer
echo   package.bat -type msi     pick the kind ^(exe, msi, app-image^)
echo   package.bat -nowix        do not fetch WiX; stop instead
echo   package.bat -pause        wait for a key before closing
echo   package.bat -h            this help
echo.
echo exe and msi need WiX Toolset 3.14. It is downloaded into
echo tools\wix314 on first use, about 40 MB, no admin rights needed.
echo.
echo The result lands in release\ and is copied to the project root.
echo.
echo Double-clicking this closes the window when it finishes. Pass
echo -pause, or make a shortcut to  cmd /k "%~f0"  to keep it open.
echo.
echo Exit code: 0 = built, non-zero = failed.
set RESULT=0
goto :done

:done
if defined HOLD (
    echo.
    pause
)
exit /b %RESULT%
