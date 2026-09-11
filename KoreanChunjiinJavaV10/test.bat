@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input (Java) - test runner for cmd.exe
rem
rem   test.bat              engine regression tests, 584 cases
rem   test.bat -q           only failures and the summary
rem   test.bat -app         engine tests, then the on-screen tests
rem   test.bat -onlyapp     on-screen tests only
rem   test.bat -shots       redraw docs\images with the four themes
rem   test.bat -pause       wait for a key before closing
rem   test.bat -h           help
rem
rem This is a thin wrapper over test.ps1. Finding a JDK, compiling and
rem running all happen there, so the two can never drift apart.
rem
rem There is no automatic "press a key" at the end, so double-clicking
rem this in Explorer shows the result and then closes the window. That
rem is on purpose: Explorer starts us as
rem   cmd /c ""...\test.bat" "
rem and a script or a CI job calling us starts us the same way, so the
rem two cannot be told apart. Guessing wrong would hang the build. Pass
rem -pause, or make a shortcut to
rem   cmd /k "...\test.bat"
rem if you want the window to stay.
rem
rem Exit code is 0 when every case passes, 1 otherwise, so this can
rem be used directly in CI.
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing. The
rem       tests themselves print Korean; that comes out of test.ps1,
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

if not exist "%~dp0test.ps1" (
    echo test.ps1 is missing next to this file.
    echo   %~dp0test.ps1
    set RESULT=1
    goto :done
)

rem Take the shell spellings as well as the PowerShell ones, so that
rem --app, -app and -App all reach test.ps1 the way it wants them.
set ARGS=
:parse
if "%~1"=="" goto :parsed
set "A=%~1"
if /i "!A!"=="-pause"     (set HOLD=1) & shift & goto :parse
if /i "!A!"=="--pause"    (set HOLD=1) & shift & goto :parse
if /i "!A!"=="--app"      set "A=-App"
if /i "!A!"=="-app"       set "A=-App"
if /i "!A!"=="--only-app" set "A=-OnlyApp"
if /i "!A!"=="-onlyapp"   set "A=-OnlyApp"
if /i "!A!"=="--shots"    set "A=-Shots"
if /i "!A!"=="-shots"     set "A=-Shots"
if /i "!A!"=="--quiet"    set "A=-q"
set "ARGS=!ARGS! !A!"
shift
goto :parse
:parsed

rem The tests print Korean, so switch the console to UTF-8 first.
rem `chcp` answers "Active code page: 949." - strip the space and the
rem full stop or the restore at the end fails.
set OLDCP=
for /f "tokens=2 delims=:" %%p in ('chcp') do set "OLDCP=%%p"
set "OLDCP=%OLDCP: =%"
set "OLDCP=%OLDCP:.=%"
chcp 65001 >nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0test.ps1"%ARGS%
set RESULT=%ERRORLEVEL%

if defined OLDCP chcp %OLDCP% >nul

if "%RESULT%"=="0" (
    echo.
    echo ALL TESTS PASSED
) else (
    echo.
    echo TESTS FAILED  ^(exit code %RESULT%^)
)
goto :done

:usage
echo Chunjiin Hangul Input ^(Java^) - test runner
echo.
echo   test.bat              engine regression tests, 584 cases
echo   test.bat -q           only failures and the summary
echo   test.bat -app         engine tests, then the on-screen tests
echo   test.bat -onlyapp     on-screen tests only
echo   test.bat -shots       redraw docs\images with the four themes
echo   test.bat -pause       wait for a key before closing
echo   test.bat -h           this help
echo.
echo The on-screen tests open a window and drive it with Robot, so they
echo need a desktop. The engine tests do not.
echo.
echo Double-clicking this closes the window when it finishes. Pass
echo -pause, or make a shortcut to  cmd /k "%~f0"  to keep it open.
echo.
echo Exit code: 0 = all passed, 1 = at least one failure.
set RESULT=0
goto :done

:done
if defined HOLD (
    echo.
    pause
)
exit /b %RESULT%
