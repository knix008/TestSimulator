@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input (Rust) - installer builder for cmd.exe
rem
rem   package.bat               test, web, app, installer, zip
rem   package.bat -skiptest     skip the tests
rem   package.bat -skipweb      skip the web build
rem   package.bat -version 1.0  stamp this version on the zip name
rem
rem   Prefixes - / -- / are all the same; case does not matter.
rem
rem This is a thin wrapper over scripts\package.ps1. Building the
rem app, embedding it in the installer, and making the zip all
rem happen there, so the two cannot drift apart.
rem
rem The same thing in PowerShell: scripts\package.ps1
rem The same thing on Linux / macOS: scripts/package.sh
rem
rem Result in the repository root:
rem   chunjiin.exe
rem   chunjiin-setup.exe          GUI installer with the app embedded
rem   chunjiin-serve.exe
rem   chunjiin-1.0-windows-x64.zip
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing. The
rem       build itself prints Korean; that comes out of package.ps1,
rem       which this script runs with the console set to UTF-8.
rem ---------------------------------------------------------------
setlocal EnableDelayedExpansion
cd /d "%~dp0"

if /i "%~1"=="-h"     goto :usage
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="/?"     goto :usage
if /i "%~1"=="help"   goto :usage

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo powershell.exe not found on PATH.
    echo Windows PowerShell ships with Windows; look in
    echo   C:\Windows\System32\WindowsPowerShell\v1.0
    exit /b 1
)

if not exist "%~dp0scripts\package.ps1" (
    echo scripts\package.ps1 is missing.
    echo   %~dp0scripts\package.ps1
    exit /b 1
)

rem Take the shell spellings as well as the PowerShell ones, so that
rem --skip-test, -skiptest and -SkipTest all reach package.ps1.
set ARGS=
:parse
if "%~1"=="" goto :parsed
set "A=%~1"
if /i "!A!"=="--skip-test" set "A=-SkipTest"
if /i "!A!"=="--skiptest"  set "A=-SkipTest"
if /i "!A!"=="-skiptest"   set "A=-SkipTest"
if /i "!A!"=="skiptest"    set "A=-SkipTest"
if /i "!A!"=="--skip-web"  set "A=-SkipWeb"
if /i "!A!"=="--skipweb"   set "A=-SkipWeb"
if /i "!A!"=="-skipweb"    set "A=-SkipWeb"
if /i "!A!"=="skipweb"     set "A=-SkipWeb"
if /i "!A!"=="--version"   set "A=-Version"
if /i "!A!"=="-version"    set "A=-Version"
if /i "!A!"=="version"     set "A=-Version"
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

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package.ps1"%ARGS%
set RESULT=%ERRORLEVEL%

if defined OLDCP chcp %OLDCP% >nul

if "%RESULT%"=="0" (
    echo.
    echo PACKAGE BUILT  ^(see the project root^)
) else (
    echo.
    echo PACKAGE FAILED  ^(exit code %RESULT%^)
)
endlocal & exit /b %RESULT%

:usage
echo Chunjiin Hangul Input ^(Rust^) - installer builder
echo.
echo   package.bat               test, web, app, installer, zip
echo   package.bat -skiptest     skip the tests
echo   package.bat -skipweb      skip the web build
echo   package.bat -version VER  stamp VER on the zip name ^(default 1.0^)
echo   package.bat -h            this help
echo.
echo Result in the project root:
echo   chunjiin.exe
echo   chunjiin-setup.exe
echo   chunjiin-serve.exe
echo   chunjiin-VER-windows-x64.zip
echo.
echo Exit code: 0 = built, non-zero = failed.
endlocal
exit /b 0
