@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input - test runner
rem
rem   test.bat            build and run the tests (PASS/FAIL per case + summary)
rem   test.bat -q         only failures and the summary
rem   test.bat -b         rebuild only, do not run
rem   test.bat -h         help
rem
rem Exit code is 0 when every case passes, 1 otherwise, so this can
rem be used directly in CI.
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing.
rem ---------------------------------------------------------------

setlocal

if /i "%~1"=="-h"     goto :usage
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="/?"     goto :usage

set ENGINE=src\chunjiin.c src\input.c
set SUITE=tests\test_engine.c
set OUT=build\test_engine.exe
set CFLAGS=-std=gnu11 -Wall -Wextra -Werror -O1 -Iinclude

where gcc >nul 2>&1
if errorlevel 1 (
    echo gcc not found on PATH.
    echo Add the MSYS2 UCRT64 bin directory, e.g. C:\msys64\ucrt64\bin
    exit /b 1
)

if not exist build mkdir build

echo building %OUT%
gcc %CFLAGS% -o %OUT% %ENGINE% %SUITE%
if errorlevel 1 (
    echo.
    echo COMPILE FAILED
    exit /b 1
)

if /i "%~1"=="-b" (
    echo built. not running.
    exit /b 0
)

rem The suite prints Korean, so switch the console to UTF-8 first.
for /f "tokens=2 delims=:" %%p in ('chcp') do set OLDCP=%%p
chcp 65001 >nul

echo.
%OUT% %*
set RESULT=%ERRORLEVEL%

chcp %OLDCP% >nul

if "%RESULT%"=="0" (
    echo.
    echo ALL TESTS PASSED
) else (
    echo.
    echo TESTS FAILED
)
exit /b %RESULT%

:usage
echo Chunjiin engine test runner
echo.
echo   test.bat        build and run, print PASS/FAIL per case + summary
echo   test.bat -q     print only failures and the summary
echo   test.bat -b     build only
echo   test.bat -h     this help
echo.
echo Exit code: 0 = all passed, 1 = at least one failure.
exit /b 0
