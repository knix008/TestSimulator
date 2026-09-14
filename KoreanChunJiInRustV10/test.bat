@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input (Rust) - test runner for cmd.exe
rem
rem   test.bat              per-area counts and a summary
rem   test.bat detail       one line per test case
rem   test.bat run NAME     only tests whose name matches NAME
rem   test.bat plain        cargo test as-is (no report)
rem
rem   Options can be combined:  test.bat detail run 모음
rem   Prefixes - / -- / are all the same; case does not matter.
rem
rem This is a thin wrapper over test.ps1. cargo and the report
rem crate do the real work there, so the two cannot drift apart.
rem
rem The same thing in PowerShell: test.ps1
rem The same thing on Linux / macOS: test.sh
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing. The
rem       tests themselves print Korean; that comes out of test.ps1,
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

if not exist "%~dp0test.ps1" (
    echo test.ps1 is missing next to this file.
    echo   %~dp0test.ps1
    exit /b 1
)

rem Take the shell spellings as well as the PowerShell ones, so that
rem --detail, -detail and -Detail all reach test.ps1 the way it wants.
set ARGS=
:parse
if "%~1"=="" goto :parsed
set "A=%~1"
if /i "!A!"=="--detail" set "A=-Detail"
if /i "!A!"=="-detail"  set "A=-Detail"
if /i "!A!"=="detail"   set "A=-Detail"
if /i "!A!"=="-v"       set "A=-Detail"
if /i "!A!"=="--plain"  set "A=-Plain"
if /i "!A!"=="-plain"   set "A=-Plain"
if /i "!A!"=="plain"    set "A=-Plain"
if /i "!A!"=="--run"    set "A=-Run"
if /i "!A!"=="-run"     set "A=-Run"
if /i "!A!"=="run"      set "A=-Run"
set "ARGS=!ARGS! !A!"
shift
goto :parse
:parsed

rem The report prints Korean, so switch the console to UTF-8 first.
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
    echo TEST OK
) else (
    echo.
    echo TEST FAILED  ^(exit code %RESULT%^)
)
endlocal & exit /b %RESULT%

:usage
echo Chunjiin Hangul Input ^(Rust^) - test runner
echo.
echo   test.bat              per-area counts and a summary
echo   test.bat detail       one line per test case
echo   test.bat run NAME     only tests whose name matches NAME
echo   test.bat plain        cargo test as-is ^(no report^)
echo   test.bat -h           this help
echo.
echo Exit code: 0 = all passed, non-zero = failed.
endlocal
exit /b 0
