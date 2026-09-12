@echo off
rem build.bat - Make a ready-to-run executable. (Windows, cmd.exe)
rem
rem   build.bat              build app, server, installer; copy only the installer to the repo root
rem   build.bat -run         run from source without building (fastest)
rem   build.bat -web         build, then start the web server
rem   build.bat -onedir      bundle as one folder (starts fast, move as a whole)
rem
rem Option prefixes - / -- / are all the same; case does not matter.
rem Does the same job as build.ps1, using cmd.exe only - no PowerShell needed.
rem
rem The default is a one-file bundle. Everything lands in dist\; only the file
rem you hand out - the installer chunjiin-setup.exe, which carries the app - is
rem copied to the repo root. A one-file bundle takes a few seconds to start (it
rem unpacks itself into a temp folder). If that bothers you, use -onedir and
rem keep dist\chunjiin\ whole; no installer is made in that case.
rem
rem scripts\package.bat runs the tests first and also makes the release zip.
rem
rem Requirements
rem   Python 3.10+. PySide6 and PyInstaller are pip-installed on demand by
rem   scripts\ensure_deps.py. Offline? Install them first:
rem       pip install PySide6 pyinstaller
rem
rem WHY THIS FILE IS ASCII ONLY (English comments and messages)
rem   cmd.exe has a bug reading UTF-8 batch files under chcp 65001: whenever a
rem   multi-byte character sits near a 4 KB read boundary, cmd loses its place
rem   and executes garbage from the middle of a line. Whether it happens depends
rem   on the exact byte size of the file, so it breaks after harmless edits.
rem   Keep every byte of this file below 0x80. Korean output from Python
rem   (test report, build log) is fine - the console is switched to UTF-8.
rem
rem No goto / labels either: label lookup is another victim of the same bug.

setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

rem Make Python speak UTF-8 so Korean output does not turn into question marks.
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

rem ---- options ------------------------------------------------------
set "RUN=0"
set "WEB=0"
set "MODE=--onefile"
set "HELP=0"
for %%A in (%*) do (
    set "ARG=%%~A"
    set "ARG=!ARG:-=!"
    set "ARG=!ARG:/=!"
    if /I "!ARG!"=="run"    set "RUN=1"
    if /I "!ARG!"=="web"    set "WEB=1"
    if /I "!ARG!"=="onedir" set "MODE=--onedir"
    if /I "!ARG!"=="h"      set "HELP=1"
    if /I "!ARG!"=="help"   set "HELP=1"
)
if "%HELP%"=="1" (
    echo Usage: build.bat [-run] [-web] [-onedir]
    echo    -run      run from source without building
    echo    -web      build, then start the web server
    echo    -onedir   bundle as one folder ^(default: one file^)
    exit /b 0
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
for /f "delims=" %%V in ('%PY% --version 2^>^&1') do set "PYVER=%%V"

rem ---- run from source ----------------------------------------------
rem Nothing is bundled; the code you just edited runs as is.
if "%RUN%"=="1" (
    echo == Running from source  ^(%PYVER%^)
    %PY% scripts\ensure_deps.py desktop
    if errorlevel 1 exit /b !errorlevel!
    %PY% -m chunjiin
    exit /b !errorlevel!
)

rem ---- build --------------------------------------------------------
echo == Chunjiin Hangul IME build
echo    %PYVER%

rem Install what is missing before starting. Bundling the app needs PySide6 too.
%PY% scripts\ensure_deps.py desktop build
if errorlevel 1 exit /b !errorlevel!

rem One-file: build the installer too and copy only that to the root.
rem One-folder: the bundle cannot be embedded or moved as a single file, so
rem it stays in dist\ and no installer is made.
if "%MODE%"=="--onedir" (
    echo -- desktop app, server  ^(%MODE%^)
    %PY% scripts\pyinstaller_build.py %MODE% --targets app serve
) else (
    echo -- desktop app, server, installer  ^(%MODE%^)
    %PY% scripts\pyinstaller_build.py %MODE% --copy-root --targets app serve setup
)
if errorlevel 1 exit /b !errorlevel!

echo == Build done

if "%WEB%"=="1" (
    echo -- web server
    %PY% -m chunjiin.web
    exit /b !errorlevel!
)
exit /b 0
