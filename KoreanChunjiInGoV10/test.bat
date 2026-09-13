@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input (Go / Fyne) - test script for Windows
rem
rem   test.bat                per-area counts and a summary
rem   test.bat detail         one line per test case
rem   test.bat cover          with coverage
rem   test.bat run NAME       only tests whose name matches NAME
rem
rem   Options can be combined:  test.bat detail cover
rem   Plain `go test ./...` works too, but prints no summary.
rem
rem What is tested
rem   test\         engine regression tests (430 cases pulled from the
rem                 C++ version's tests/test_engine.c, plus hand-written ones)
rem   internal\ui   palettes, settings, layout, cursor mapping, language,
rem                 and a smoke test that builds the window
rem
rem The report is produced by cmd\testreport, which also hands the
rem counts back so that a summary is printed at the end. The ui tests
rem open a window through Fyne, so a MinGW-w64 gcc is needed just as
rem for the build; scripts\prereq.bat checks for it and offers to
rem install it.
rem
rem The same thing in PowerShell: test.ps1.
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing.
rem ---------------------------------------------------------------
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set GOARGS=
set OPTS=

:parse
if "%~1"=="" goto :parsed
set "ARG=%~1"
set KNOWN=0
for %%k in (detail -v cover run help -h) do if /i "!ARG!"=="%%k" set KNOWN=1
if "!KNOWN!"=="0" (
    echo unknown option: !ARG!
    echo.
    goto :usage_fail
)
set OPTS=!OPTS! !ARG!
if /i "!ARG!"=="detail" set GOARGS=!GOARGS! -v
if /i "!ARG!"=="-v"     set GOARGS=!GOARGS! -v
if /i "!ARG!"=="cover"  set GOARGS=!GOARGS! -cover
if /i "!ARG!"=="help"   goto :usage
if /i "!ARG!"=="-h"     goto :usage
if /i "!ARG!"=="run" (
    if "%~2"=="" (
        echo run needs a name:  test.bat run NAME
        exit /b 2
    )
    set GOARGS=!GOARGS! -run "%~2"
    set OPTS=!OPTS! %~2
    shift
)
shift
goto :parse
:parsed

echo ============================================================
echo  Chunjiin Hangul Input - test
echo ============================================================
if defined OPTS echo   options    :%OPTS%
echo   source dir : %CD%
echo.

call scripts\prereq.bat || goto :error

echo ------------------------------------------------------------
echo  Test
echo ------------------------------------------------------------

rem The report prints Korean; switch the console to UTF-8 while it
rem runs and put the previous code page back afterwards.
for /f "tokens=2 delims=:" %%c in ('chcp') do set OLDCP=%%c
set OLDCP=%OLDCP: =%
chcp 65001 >nul

rem testreport writes one ASCII line here for us to read back:
rem   total=722 pass=722 fail=0 skip=0 result=PASS
set "SUMMARY=%TEMP%\chunjiin-test-summary.txt"
del /q "%SUMMARY%" >nul 2>&1

echo   go run ./cmd/testreport%GOARGS%
go run ./cmd/testreport%GOARGS% -summary "%SUMMARY%"
set RC=!errorlevel!

chcp %OLDCP% >nul

rem ---------------------------------------------------------------
rem Summary
rem ---------------------------------------------------------------
echo ------------------------------------------------------------
echo  Summary
echo ------------------------------------------------------------
set S_total=
if exist "%SUMMARY%" (
    for /f "usebackq delims=" %%l in ("%SUMMARY%") do for %%p in (%%l) do set "S_%%p"
    del /q "%SUMMARY%" >nul 2>&1
)
if defined S_total (
    echo   total     !S_total!
    echo   passed    !S_pass!
    echo   failed    !S_fail!
    if not "!S_skip!"=="0" echo   skipped   !S_skip!
    if defined OPTS echo   options  %OPTS%
    echo   result    !S_result!
) else (
    echo   no summary: the tests did not run to the end ^(see above^)
)
echo ------------------------------------------------------------
if "!RC!"=="0" (
    echo  TEST OK
) else (
    echo  TEST FAILED  ^(exit code !RC!^)
)
echo ------------------------------------------------------------
endlocal & exit /b %RC%

rem --- usage ---------------------------------------------------------
:usage
call :print_usage
endlocal
exit /b 0

:usage_fail
call :print_usage
endlocal
exit /b 2

:print_usage
for /f "tokens=* delims=" %%l in ('findstr /B /C:"rem   test.bat" "%~f0"') do (
    set "L=%%l"
    echo !L:~4!
)
exit /b 0

:error
echo.
echo ------------------------------------------------------------
echo  FAILED
echo ------------------------------------------------------------
endlocal
exit /b 1
