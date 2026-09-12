@echo off
rem test.bat - Run the tests and report them by section. (Windows, cmd.exe)
rem
rem   test.bat              per-section counts and a summary
rem   test.bat -detail      one line per test
rem   test.bat -run WORD    only tests whose name contains WORD
rem
rem Option prefixes - / -- / are all the same; case does not matter.
rem Does the same job as test.ps1, using cmd.exe only - no PowerShell needed.
rem
rem What is covered
rem   tests\test_cases.py   engine regression: 430 cases (tests\cases.tsv)
rem                         taken from KoreanChunJiInC++ tests/test_engine.c
rem   tests\test_engine.py  what cannot be table-driven: all 26 letters,
rem                         label/input agreement, original functions, edges
rem   tests\test_ui.py      palette, settings, layout, cursor, language,
rem                         drawing, and a window smoke test
rem   tests\test_web.py     server routing, state object, live server poke
rem
rem pytest is not required. tests\report.py finds the tests, runs them and
rem prints the report itself. PySide6 (window tests) is pip-installed on
rem demand by scripts\ensure_deps.py.
rem
rem WHY THIS FILE IS ASCII ONLY (English comments and messages)
rem   cmd.exe has a bug reading UTF-8 batch files under chcp 65001: whenever a
rem   multi-byte character sits near a 4 KB read boundary, cmd loses its place
rem   and executes garbage from the middle of a line. Whether it happens depends
rem   on the exact byte size of the file, so it breaks after harmless edits.
rem   Keep every byte of this file below 0x80. The report itself is printed by
rem   Python in Korean and shows fine - the console is switched to UTF-8.
rem
rem No goto / labels either: label lookup is another victim of the same bug.

setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

rem Make Python speak UTF-8 so Korean output does not turn into question marks.
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

rem Draw without opening windows so it also runs on a headless machine.
rem This is set inside setlocal, so it is gone when this file ends. (Unlike
rem test.ps1, it cannot linger in the caller's console and stop the app
rem from showing its window later.)
if not defined QT_QPA_PLATFORM set "QT_QPA_PLATFORM=offscreen"

rem ---- options ------------------------------------------------------
rem The word after -run is passed through to tests.report as is.
set "ARGS="
set "WANT_RUN=0"
set "HELP=0"
for %%A in (%*) do (
    if "!WANT_RUN!"=="1" (
        set "ARGS=!ARGS! -run "%%~A""
        set "WANT_RUN=0"
    ) else (
        set "ARG=%%~A"
        set "ARG=!ARG:-=!"
        set "ARG=!ARG:/=!"
        if /I "!ARG!"=="detail" set "ARGS=!ARGS! -v"
        if /I "!ARG!"=="v"      set "ARGS=!ARGS! -v"
        if /I "!ARG!"=="run"    set "WANT_RUN=1"
        if /I "!ARG!"=="h"      set "HELP=1"
        if /I "!ARG!"=="help"   set "HELP=1"
    )
)
if "%HELP%"=="1" (
    echo Usage: test.bat [-detail] [-run WORD]
    echo    -detail     one line per test
    echo    -run WORD   only tests whose name contains WORD
    exit /b 0
)
if "%WANT_RUN%"=="1" (
    echo -run needs a word after it.>&2
    exit /b 2
)

rem ---- python -------------------------------------------------------
rem Finding a name on PATH is not enough. On Windows "python3" may be the
rem Store stub that does nothing, so actually run each candidate and ask
rem whether it is 3.10 or newer.
set "PY="
for %%N in (python py python3) do (
    if not defined PY (
        %%N -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
        if not errorlevel 1 set "PY=%%N"
    )
)
if not defined PY (
    echo Python 3.10 or newer was not found.>&2
    exit /b 1
)

rem ---- tests --------------------------------------------------------
rem Without PySide6 the window tests are skipped wholesale and the result is
rem only half a report. Get it first.
%PY% scripts\ensure_deps.py desktop
if errorlevel 1 exit /b !errorlevel!

rem Exit code is 0 when everything passes, 1 otherwise. Passed through as is.
%PY% -m tests.report%ARGS%
exit /b %errorlevel%
