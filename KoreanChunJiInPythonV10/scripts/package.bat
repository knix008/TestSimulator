@echo off
rem package.bat - Make the installer and the release bundle. (Windows, cmd.exe)
rem
rem   scripts\package.bat
rem   scripts\package.bat -skiptest
rem   scripts\package.bat -version 1.0
rem
rem Option prefixes - / -- / are all the same; case does not matter.
rem Does the same job as package.ps1, using cmd.exe only - no PowerShell needed.
rem
rem What it does
rem   1. run the tests
rem   2. build the app and the server as one file each  -> dist\chunjiin.exe, dist\chunjiin-serve.exe
rem   3. embed that app inside the installer
rem   4. build the installer as one file               -> chunjiin-setup.exe (the only file in the root)
rem   5. make the release bundle                       -> chunjiin-VER-windows-x64.zip
rem
rem No WiX or Inno Setup needed. The GUI installer is written in Python and
rem carries the app inside itself. PySide6 and PyInstaller are pip-installed
rem on demand by scripts\ensure_deps.py.
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
cd /d "%~dp0.."
set "ROOT=%CD%"

rem Make Python speak UTF-8 so Korean output does not turn into question marks.
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

rem ---- options ------------------------------------------------------
set "SKIPTEST=0"
set "VERSION=1.0"
set "WANT_VERSION=0"
set "HELP=0"
for %%A in (%*) do (
    if "!WANT_VERSION!"=="1" (
        set "VERSION=%%~A"
        set "WANT_VERSION=0"
    ) else (
        set "ARG=%%~A"
        set "ARG=!ARG:-=!"
        set "ARG=!ARG:/=!"
        if /I "!ARG!"=="skiptest" set "SKIPTEST=1"
        if /I "!ARG!"=="version"  set "WANT_VERSION=1"
        if /I "!ARG!"=="h"        set "HELP=1"
        if /I "!ARG!"=="help"     set "HELP=1"
    )
)
if "%HELP%"=="1" (
    echo Usage: scripts\package.bat [-skiptest] [-version VER]
    echo    -skiptest      do not run the tests first
    echo    -version VER   version stamped on the zip name ^(default 1.0^)
    exit /b 0
)
if "%WANT_VERSION%"=="1" (
    echo -version needs a value after it.>&2
    exit /b 2
)

rem Same rule as package.ps1: any 64-bit Windows is called x64.
set "ARCH=x86"
if /I "%PROCESSOR_ARCHITECTURE%"=="AMD64" set "ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=x64"
if defined PROCESSOR_ARCHITEW6432 set "ARCH=x64"

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

echo == Chunjiin installer build  %VERSION%  (windows/%ARCH%)

%PY% scripts\ensure_deps.py desktop build
if errorlevel 1 exit /b !errorlevel!

rem ---- tests --------------------------------------------------------
if "%SKIPTEST%"=="0" (
    echo -- tests
    rem Draw without opening windows. Set inside setlocal, so it does not
    rem linger in the caller's console after this file ends.
    set "QT_QPA_PLATFORM=offscreen"
    %PY% -m tests.report
    if errorlevel 1 (
        echo Tests did not pass.>&2
        exit /b 1
    )
)

rem ---- build --------------------------------------------------------
echo -- app, server, installer
rem All three as one file; only the installer is copied to the repo root.
rem The installer embeds the app built just before it, so the order matters;
rem pyinstaller_build.py keeps that order.
%PY% scripts\pyinstaller_build.py --clean --copy-root --targets app serve setup
if errorlevel 1 exit /b !errorlevel!

rem ---- release bundle -----------------------------------------------
echo -- release bundle
set "ZIPNAME=chunjiin-%VERSION%-windows-%ARCH%.zip"
set "ZIP=%ROOT%\%ZIPNAME%"
if exist "%ZIP%" del /f /q "%ZIP%"

set "STAGE=%TEMP%\chunjiin-pkg-%RANDOM%%RANDOM%"
set "PKG=%STAGE%\chunjiin-%VERSION%"
mkdir "%PKG%" || exit /b 1
rem The app and the server live in dist\, the installer in the root.
for %%F in (dist\chunjiin.exe dist\chunjiin-serve.exe chunjiin-setup.exe README.md UsersGuide.md) do (
    if exist "%ROOT%\%%F" copy /y "%ROOT%\%%F" "%PKG%\" >nul
)

rem Windows 10 1803+ ships bsdtar as tar.exe; -a picks the format from the
rem extension. Use the System32 one explicitly so a GNU tar from Git or
rem MSYS earlier on PATH (which cannot write zip) is not picked by accident.
set "TAR=%SystemRoot%\System32\tar.exe"
if exist "%TAR%" (
    "%TAR%" -a -c -f "%ZIP%" -C "%STAGE%" "chunjiin-%VERSION%"
) else (
    powershell -NoProfile -Command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%ZIP%' -Force"
)
set "ZIPCODE=!errorlevel!"
rmdir /s /q "%STAGE%"
if not "%ZIPCODE%"=="0" (
    echo Could not make %ZIPNAME%.>&2
    exit /b 1
)

rem ---- what was made ------------------------------------------------
echo == Output
for %%F in (dist\chunjiin.exe dist\chunjiin-serve.exe chunjiin-setup.exe %ZIPNAME%) do (
    if exist "%ROOT%\%%F" (
        rem 32-bit integer math: 104858 bytes = 0.1 MB, fine below 2 GB.
        set /a "T=%%~zF / 104858"
        set /a "W=!T! / 10, D=!T! %% 10"
        set "NAME=%%F                                        "
        echo    !NAME:~0,38! !W!.!D! MB
    )
)
exit /b 0
