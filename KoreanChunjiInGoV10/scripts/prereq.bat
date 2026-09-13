@echo off
rem ---------------------------------------------------------------
rem scripts\prereq.bat - check what the build needs, offer to install
rem
rem   Called by build.bat and test.bat:    call scripts\prereq.bat
rem   Returns 0 when everything is ready, 1 otherwise.
rem
rem   Checks, in this order, and asks before installing anything:
rem     1. Go                winget install GoLang.Go
rem     2. MinGW-w64 gcc     winget install MSYS2.MSYS2, then
rem                          pacman -S mingw-w64-ucrt-x86_64-gcc
rem                          (Fyne draws with OpenGL through cgo, so a
rem                          C compiler is needed for the desktop app)
rem     3. Go modules        go mod download   (network, first time only)
rem
rem   Deliberately no setlocal: the PATH changes made here must reach
rem   the caller so that go.exe and gcc.exe are found afterwards.
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing.
rem ---------------------------------------------------------------

set PREREQ_MSYS2=C:\msys64
if defined MSYS2_ROOT set PREREQ_MSYS2=%MSYS2_ROOT%

echo ------------------------------------------------------------
echo  Checking prerequisites
echo ------------------------------------------------------------

rem ---------------------------------------------------------------
rem 1. Go
rem ---------------------------------------------------------------
where go >nul 2>&1
if errorlevel 1 (
    for %%d in ("%ProgramFiles%\Go\bin" "%LOCALAPPDATA%\Programs\Go\bin" "C:\Go\bin") do (
        if exist "%%~d\go.exe" call :use_dir "%%~d"
    )
)
where go >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [missing] Go is not installed ^(or not on PATH^).
    echo             It can be installed automatically with:
    echo               winget install GoLang.Go
    echo.
    choice /C YN /N /M "  Install Go now? [Y/N] "
    if errorlevel 2 (
        echo   Cancelled. Install Go from https://go.dev/dl/ and run again.
        exit /b 1
    )
    call :need_winget || exit /b 1
    winget install --id GoLang.Go -e --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo   winget could not install Go. Install it from https://go.dev/dl/ and run again.
        exit /b 1
    )
    call :use_dir "%ProgramFiles%\Go\bin"
    where go >nul 2>&1
    if errorlevel 1 (
        echo   Go was installed, but go.exe is still not on PATH.
        echo   Open a new terminal and run again.
        exit /b 1
    )
)
for /f "tokens=3" %%v in ('go version') do set PREREQ_GOVER=%%v
for /f "delims=" %%v in ('where go') do if not defined PREREQ_GOPATH set PREREQ_GOPATH=%%v
echo   Go     : %PREREQ_GOVER%   %PREREQ_GOPATH%
set PREREQ_GOPATH=

rem ---------------------------------------------------------------
rem 2. MinGW-w64 gcc
rem
rem A Cygwin gcc earlier on PATH does not work for cgo, so check what
rem the gcc on PATH targets, and fall back to the MSYS2 / MinGW-w64
rem directories when it is not usable.
rem ---------------------------------------------------------------
set PREREQ_MINGW=
set PREREQ_GCCTARGET=
where gcc >nul 2>&1
if not errorlevel 1 for /f "delims=" %%v in ('gcc -dumpmachine') do set PREREQ_GCCTARGET=%%v
if defined PREREQ_GCCTARGET (
    echo %PREREQ_GCCTARGET% | find /i "mingw" >nul && set PREREQ_MINGW=1
)

if not defined PREREQ_MINGW for %%d in ("%PREREQ_MSYS2%\ucrt64\bin" "%PREREQ_MSYS2%\mingw64\bin" "C:\mingw64\bin") do (
    if not defined PREREQ_MINGW if exist "%%~d\gcc.exe" call :use_gcc "%%~d"
)

if not defined PREREQ_MINGW (
    echo.
    echo   [missing] MinGW-w64 gcc was not found.
    if defined PREREQ_GCCTARGET echo             ^(the gcc on PATH targets %PREREQ_GCCTARGET%, which cgo cannot use^)
    echo             The desktop app uses Fyne, which needs a C compiler ^(cgo^).
    echo             It can be installed automatically with:
    echo               winget install MSYS2.MSYS2
    echo               pacman -S mingw-w64-ucrt-x86_64-gcc      ^(inside MSYS2^)
    echo.
    choice /C YN /N /M "  Install MSYS2 and MinGW-w64 gcc now? [Y/N] "
    if errorlevel 2 (
        echo   Cancelled. See Build.md for the manual steps.
        exit /b 1
    )
    if not exist "%PREREQ_MSYS2%\usr\bin\bash.exe" (
        call :need_winget || exit /b 1
        winget install --id MSYS2.MSYS2 -e --accept-source-agreements --accept-package-agreements
        if errorlevel 1 (
            echo   winget could not install MSYS2. See Build.md for the manual steps.
            exit /b 1
        )
    )
    if not exist "%PREREQ_MSYS2%\usr\bin\bash.exe" (
        echo   MSYS2 was not found at %PREREQ_MSYS2%.
        echo   If it is installed elsewhere, set MSYS2_ROOT to that folder and run again.
        exit /b 1
    )
    echo   Installing mingw-w64-ucrt-x86_64-gcc with pacman ...
    "%PREREQ_MSYS2%\usr\bin\bash.exe" -lc "pacman -Sy --noconfirm --needed mingw-w64-ucrt-x86_64-gcc"
    if errorlevel 1 (
        echo   pacman failed. Open an MSYS2 shell and run:
        echo     pacman -S mingw-w64-ucrt-x86_64-gcc
        exit /b 1
    )
    if not exist "%PREREQ_MSYS2%\ucrt64\bin\gcc.exe" (
        echo   gcc.exe is still missing from %PREREQ_MSYS2%\ucrt64\bin.
        exit /b 1
    )
    call :use_gcc "%PREREQ_MSYS2%\ucrt64\bin"
)
for /f "delims=" %%v in ('gcc -dumpversion') do set PREREQ_GCCVER=%%v
for /f "delims=" %%v in ('gcc -dumpmachine') do set PREREQ_GCCTARGET=%%v
for /f "delims=" %%v in ('where gcc') do if not defined PREREQ_GCCPATH set PREREQ_GCCPATH=%%v
echo   gcc    : %PREREQ_GCCVER% (%PREREQ_GCCTARGET%)   %PREREQ_GCCPATH%
set PREREQ_GCCPATH=

rem ---------------------------------------------------------------
rem 3. Go modules
rem
rem go build fetches them by itself, but that needs the network and
rem takes a while the first time, so say so and ask first. Fyne is
rem the big one; if it is in the module cache the rest usually is.
rem ---------------------------------------------------------------
set PREREQ_FYNEVER=
for /f "tokens=1-3" %%a in ('findstr /C:"fyne.io/fyne/v2 " go.mod') do (
    if /i "%%a"=="require" (set PREREQ_FYNEVER=%%c) else (set PREREQ_FYNEVER=%%b)
)
for /f "delims=" %%v in ('go env GOMODCACHE') do set PREREQ_MODCACHE=%%v
if not exist "%PREREQ_MODCACHE%\fyne.io\fyne\v2@%PREREQ_FYNEVER%\go.mod" (
    echo.
    echo   [missing] Go module dependencies ^(Fyne %PREREQ_FYNEVER% and others^) are not downloaded yet.
    echo             They are fetched over the network with:  go mod download
    echo             ^(go may also fetch the Go toolchain version named in go.mod.^)
    echo.
    choice /C YN /N /M "  Download them now? [Y/N] "
    if errorlevel 2 (
        echo   Cancelled.
        exit /b 1
    )
    go mod download
    if errorlevel 1 (
        echo   go mod download failed.
        exit /b 1
    )
)
echo   modules: ok   %PREREQ_MODCACHE%
echo.
exit /b 0

rem --- helpers ---------------------------------------------------
:use_dir
set "PATH=%~1;%PATH%"
exit /b 0

:use_gcc
set "PATH=%~1;%PATH%"
set PREREQ_MINGW=1
exit /b 0

:need_winget
where winget >nul 2>&1
if errorlevel 1 (
    echo   winget is not available on this machine, so it cannot be installed automatically.
    echo   Get winget from the Microsoft Store ^("App Installer"^) or install manually. See Build.md.
    exit /b 1
)
exit /b 0
