@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input - build script (MinGW-w64 / MSYS2 gcc)
rem
rem   build.bat             build app, tests and installer
rem   build.bat test        build, then run the engine tests
rem   build.bat verbose     build and echo every compiler command line
rem   build.bat clean       remove build outputs
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing.
rem ---------------------------------------------------------------

setlocal EnableDelayedExpansion

set ENGINE=src\chunjiin.c src\input.c
set INC=-Iinclude
set CFLAGS=-std=gnu11 -Wall -Wextra -O2
set LDFLAGS_APP=-mwindows -lcomdlg32 -lcomctl32 -lgdi32 -ldwmapi -ladvapi32
set LDFLAGS_SETUP=-mwindows -lole32 -luuid -lshell32 -lcomctl32 -ladvapi32

if /i "%~1"=="clean" (
    if exist build rmdir /s /q build
    if exist chunjiin.exe del /q chunjiin.exe
    if exist chunjiin-setup.exe del /q chunjiin-setup.exe
    echo cleaned: build\, chunjiin.exe, chunjiin-setup.exe
    exit /b 0
)

set VERBOSE=0
if /i "%~1"=="verbose" set VERBOSE=1
if /i "%~1"=="-v"      set VERBOSE=1

rem ---------------------------------------------------------------
rem Environment
rem ---------------------------------------------------------------
where gcc >nul 2>&1
if errorlevel 1 (
    echo gcc not found on PATH.
    echo Add the MSYS2 UCRT64 bin directory, e.g. C:\msys64\ucrt64\bin
    echo See Build.md for the install steps.
    exit /b 1
)

for /f "delims=" %%v in ('gcc -dumpversion') do set GCCVER=%%v
for /f "delims=" %%v in ('gcc -dumpmachine') do set GCCTARGET=%%v
for /f "delims=" %%v in ('where gcc') do (
    if not defined GCCPATH set GCCPATH=%%v
)

echo ============================================================
echo  Chunjiin Hangul Input - build
echo ============================================================
echo   compiler   : gcc %GCCVER%  (%GCCTARGET%)
echo   location   : %GCCPATH%
echo   flags      : %CFLAGS% %INC%
echo   source dir : %CD%
echo   output dir : %CD%\build
echo ------------------------------------------------------------

if not exist build mkdir build

rem ---------------------------------------------------------------
echo [1/6] resource : src\app.rc  (icon, manifest, version)
if "%VERBOSE%"=="1" echo        windres -Isrc -Iinclude src\app.rc -O coff -o build\app.res
windres -Isrc -Iinclude src\app.rc -O coff -o build\app.res || goto :error

rem ---------------------------------------------------------------
echo [2/6] compile  : application objects
for %%f in (src\chunjiin.c src\input.c src\main.c) do (
    echo        cc  %%f
    if "%VERBOSE%"=="1" echo            gcc %CFLAGS% %INC% -c %%f -o build\%%~nf.o
    gcc %CFLAGS% %INC% -c %%f -o build\%%~nf.o || goto :error
)

echo [3/6] link     : build\chunjiin.exe
if "%VERBOSE%"=="1" echo        gcc -o build\chunjiin.exe build\chunjiin.o build\input.o build\main.o build\app.res %LDFLAGS_APP%
gcc -o build\chunjiin.exe build\chunjiin.o build\input.o build\main.o build\app.res %LDFLAGS_APP% || goto :error

rem Keep a copy at the repository root so it is easy to run.
copy /y build\chunjiin.exe chunjiin.exe >nul
if errorlevel 1 goto :error

rem ---------------------------------------------------------------
echo [4/6] compile  : engine tests
echo        cc  tests\test_engine.c
if "%VERBOSE%"=="1" echo        gcc %CFLAGS% %INC% -o build\test_engine.exe %ENGINE% tests\test_engine.c
gcc %CFLAGS% %INC% -o build\test_engine.exe %ENGINE% tests\test_engine.c || goto :error

rem ---------------------------------------------------------------
echo [5/6] resource : installer\setup.rc  (embeds build\chunjiin.exe)
if "%VERBOSE%"=="1" echo        windres -Iinstaller installer\setup.rc -O coff -o build\setup.res
windres -Iinstaller installer\setup.rc -O coff -o build\setup.res || goto :error

echo [6/6] compile  : installer
echo        cc  installer\setup.c
if "%VERBOSE%"=="1" echo        gcc %CFLAGS% -Iinstaller -o build\chunjiin-setup.exe installer\setup.c build\setup.res %LDFLAGS_SETUP%
gcc %CFLAGS% -Iinstaller -o build\chunjiin-setup.exe installer\setup.c build\setup.res %LDFLAGS_SETUP% || goto :error

rem Put the installer at the repository root so it is easy to find and hand out.
copy /y build\chunjiin-setup.exe chunjiin-setup.exe >nul
if errorlevel 1 goto :error

rem ---------------------------------------------------------------
echo ------------------------------------------------------------
echo  Artifacts
echo ------------------------------------------------------------
for %%f in (chunjiin.exe chunjiin-setup.exe build\chunjiin.exe build\test_engine.exe build\app.res build\setup.res) do (
    if exist %%f (
        set "SZ=%%~zf"
        set /a KB=!SZ! / 1024
        set "ROW=%%f"
        call :pad
        echo   !ROW!  !KB! KB
    ) else (
        echo   %%f  MISSING
    )
)
echo.
echo   chunjiin.exe         the application. run it directly.
echo   chunjiin-setup.exe   installer. run it to install the app.
echo   build\setup.res      installer resources, with the app embedded.
echo ------------------------------------------------------------
echo  BUILD OK
echo ============================================================

if /i "%~1"=="test" (
    echo.
    chcp 65001 >nul
    build\test_engine.exe
    if errorlevel 1 goto :error
)
endlocal
exit /b 0

rem --- pad ROW to 24 characters so the sizes line up --------------
:pad
if not "!ROW:~23,1!"=="" exit /b 0
set "ROW=!ROW! "
goto :pad

:error
echo.
echo ============================================================
echo  BUILD FAILED
echo ============================================================
endlocal
exit /b 1
