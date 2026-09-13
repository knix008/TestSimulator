@echo off
rem ---------------------------------------------------------------
rem Chunjiin Hangul Input (Go / Fyne) - build script for Windows
rem
rem   build.bat             build the app and the installer, then offer to install
rem   build.bat run         build, then start the app
rem   build.bat install     build, then install (no "install now?" question)
rem   build.bat uninstall   remove the installed copy
rem   build.bat clean       remove build outputs
rem
rem Every build leaves both files in the repository root:
rem   chunjiin.exe         the application
rem   chunjiin-setup.exe   stand-alone GUI installer with the app embedded
rem                        (cmd\chunjiin-setup); hand this one out
rem
rem What the build needs (Go, MinGW-w64 gcc, Go modules) is checked by
rem scripts\prereq.bat. Anything missing is reported and, only if you
rem say yes, installed with winget.
rem
rem Installing
rem   goes to      %LOCALAPPDATA%\Programs\Chunjiin   (no admin rights)
rem   asks         whether to create a desktop shortcut
rem                whether to create a Start Menu shortcut
rem   if a copy is already installed, asks whether to remove it and
rem                reinstall; "No" leaves everything as it is
rem   registers    an entry in Settings > Apps, whose Uninstall runs
rem                the uninstall.bat placed in the install folder
rem
rem The same thing in PowerShell: build.ps1 / scripts\package.ps1.
rem
rem NOTE: keep this file ASCII-only. cmd.exe reads .bat as the ANSI
rem       code page, so UTF-8 Korean text here breaks parsing.
rem ---------------------------------------------------------------
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set VERSION=1.0
set APP_LDFLAGS=-s -w -X github.com/knix008/chunjiin/internal/ui.Version=%VERSION%
set SETUP_LDFLAGS=-s -w -X main.Version=%VERSION%
set PAYLOAD=cmd\chunjiin-setup\payload
set HELPER=scripts\install-helper.ps1

if not defined LOCALAPPDATA set "LOCALAPPDATA=%USERPROFILE%\AppData\Local"
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\Chunjiin"
set "INSTALL_EXE=%INSTALL_DIR%\chunjiin.exe"
set "UNINSTALL_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Chunjiin"

set MODE=%~1
if "%MODE%"=="" set MODE=build
if /i "%MODE%"=="build"     goto :start
if /i "%MODE%"=="run"       goto :start
if /i "%MODE%"=="install"   goto :start
if /i "%MODE%"=="uninstall" goto :uninstall
if /i "%MODE%"=="clean"     goto :clean
if /i "%MODE%"=="help"      goto :usage
if /i "%MODE%"=="-h"        goto :usage
if /i "%MODE%"=="/?"        goto :usage
echo unknown option: %MODE%
echo.
goto :usage_fail

rem ===============================================================
rem  Build
rem ===============================================================
:start
echo ============================================================
echo  Chunjiin Hangul Input - build  (%VERSION%)
echo ============================================================
echo   mode       : %MODE%
echo   source dir : %CD%
echo.

call scripts\prereq.bat || goto :error

rem go build cannot overwrite chunjiin.exe while it is running.
call :ensure_not_running || goto :error

echo ------------------------------------------------------------
echo  Build
echo ------------------------------------------------------------
echo [1/3] app        go build ./cmd/chunjiin  -^>  chunjiin.exe
go build -ldflags "-H windowsgui %APP_LDFLAGS%" -o chunjiin.exe ./cmd/chunjiin || goto :error

rem The installer embeds the app (go:embed payload). Put the fresh
rem build there, build the installer, and take it out again so the
rem big binary never ends up in the repository.
echo [2/3] embed      chunjiin.exe  -^>  %PAYLOAD%\
copy /y chunjiin.exe "%PAYLOAD%\chunjiin.exe" >nul || goto :error
echo [3/3] installer  go build ./cmd/chunjiin-setup  -^>  chunjiin-setup.exe
go build -ldflags "-H windowsgui %SETUP_LDFLAGS%" -o chunjiin-setup.exe ./cmd/chunjiin-setup
set RC=!errorlevel!
del /q "%PAYLOAD%\chunjiin.exe" >nul 2>&1
if not "!RC!"=="0" goto :error

echo ------------------------------------------------------------
echo  BUILD OK
echo ------------------------------------------------------------
echo   %CD%
call :show_size chunjiin.exe        "the application. run it directly."
call :show_size chunjiin-setup.exe  "GUI installer with the app embedded. hand this one out."

if /i "%MODE%"=="run" (
    echo.
    echo   starting chunjiin.exe
    start "" "%CD%\chunjiin.exe"
    goto :done
)
if /i "%MODE%"=="install" goto :install

echo.
echo   To install without the GUI installer:  build.bat install
choice /C YN /N /M "  Install it now to %INSTALL_DIR% ? [Y/N] "
if errorlevel 2 goto :done

rem ===============================================================
rem  Install
rem ===============================================================
:install
echo.
echo ------------------------------------------------------------
echo  Install
echo ------------------------------------------------------------
echo   target : %INSTALL_DIR%

rem -- already installed? (by this script, or by chunjiin-setup.exe)
set EXISTING=
if exist "%INSTALL_EXE%" set EXISTING=1
reg query "%UNINSTALL_KEY%" >nul 2>&1 && set EXISTING=1
if defined EXISTING (
    echo.
    echo   An installed copy was found:
    for /f "tokens=2,*" %%a in ('reg query "%UNINSTALL_KEY%" /v DisplayVersion 2^>nul ^| find "REG_SZ"') do echo     version : %%b
    if exist "%INSTALL_EXE%" echo     file    : %INSTALL_EXE%
    echo   Reinstalling removes it first ^(files, shortcuts, Settings ^> Apps entry^).
    echo.
    choice /C YN /N /M "  Remove it and reinstall? [Y/N] "
    if errorlevel 2 (
        echo   Cancelled. The installed copy was left untouched.
        goto :done
    )
    call :do_uninstall || goto :error
    echo.
)

rem -- shortcuts
set WANT_DESKTOP=0
set WANT_STARTMENU=0
choice /C YN /N /M "  Create a desktop shortcut?     [Y/N] "
if not errorlevel 2 set WANT_DESKTOP=1
choice /C YN /N /M "  Create a Start Menu shortcut?  [Y/N] "
if not errorlevel 2 set WANT_STARTMENU=1
echo.

rem -- copy files
echo   installing to %INSTALL_DIR%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" || goto :error
copy /y chunjiin.exe "%INSTALL_EXE%" >nul || goto :error
copy /y scripts\uninstall.bat "%INSTALL_DIR%\uninstall.bat" >nul || goto :error
echo     %INSTALL_EXE%
echo     %INSTALL_DIR%\uninstall.bat

rem -- shortcuts
if "%WANT_DESKTOP%"=="1" (
    echo   desktop shortcut
    call :helper shortcut-add desktop "%INSTALL_EXE%" || goto :error
)
if "%WANT_STARTMENU%"=="1" (
    echo   Start Menu shortcut
    call :helper shortcut-add startmenu "%INSTALL_EXE%" || goto :error
)

rem -- Settings > Apps entry
echo   registering in Settings ^> Apps
call :helper register "%INSTALL_DIR%" "%VERSION%" || goto :error

echo ------------------------------------------------------------
echo  INSTALL OK
echo ------------------------------------------------------------
echo   run       : %INSTALL_EXE%
if "%WANT_DESKTOP%"=="1"   echo               or the desktop shortcut
if "%WANT_STARTMENU%"=="1" echo               or the Start Menu shortcut
echo   uninstall : build.bat uninstall,  Settings ^> Apps,  or %INSTALL_DIR%\uninstall.bat
goto :done

rem ===============================================================
rem  Uninstall
rem ===============================================================
:uninstall
echo ============================================================
echo  Chunjiin Hangul Input - uninstall
echo ============================================================
set EXISTING=
if exist "%INSTALL_DIR%" set EXISTING=1
reg query "%UNINSTALL_KEY%" >nul 2>&1 && set EXISTING=1
if not defined EXISTING (
    echo   Nothing is installed at %INSTALL_DIR%.
    goto :done
)
echo   folder : %INSTALL_DIR%
echo.
choice /C YN /N /M "  Remove it? [Y/N] "
if errorlevel 2 (
    echo   Cancelled.
    goto :done
)
call :do_uninstall || goto :error
echo.
echo   Done.
goto :done

rem ===============================================================
rem  Clean
rem ===============================================================
:clean
for %%f in (chunjiin.exe chunjiin-setup.exe "%PAYLOAD%\chunjiin.exe") do (
    if exist "%%~f" (
        del /q "%%~f"
        echo   removed %%~f
    )
)
echo   cleaned.
goto :done

rem ===============================================================
rem  Subroutines
rem ===============================================================

rem --- do_uninstall: remove files, shortcuts and registry entry -----
rem Works for a copy installed by this script or by chunjiin-setup.exe:
rem shortcuts are matched by what they point at, not by name.
:do_uninstall
call :ensure_not_running || exit /b 1
echo   removing shortcuts
call :helper shortcut-remove desktop   "%INSTALL_EXE%" || exit /b 1
call :helper shortcut-remove startmenu "%INSTALL_EXE%" || exit /b 1
echo   removing Settings ^> Apps entry
reg delete "%UNINSTALL_KEY%" /f >nul 2>&1
if exist "%INSTALL_DIR%" (
    echo   removing %INSTALL_DIR%
    rd /s /q "%INSTALL_DIR%"
    if exist "%INSTALL_DIR%" (
        echo   could not remove %INSTALL_DIR%. Is a file in it open?
        exit /b 1
    )
)
exit /b 0

rem --- ensure_not_running: chunjiin.exe must not be running ---------
:ensure_not_running
tasklist /FI "IMAGENAME eq chunjiin.exe" 2>nul | find /i "chunjiin.exe" >nul
if errorlevel 1 exit /b 0
echo.
echo   chunjiin.exe is running. It has to be closed to continue.
choice /C YN /N /M "  Close it now? [Y/N] "
if errorlevel 2 (
    echo   Cancelled.
    exit /b 1
)
taskkill /F /IM chunjiin.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo.
exit /b 0

rem --- helper: run scripts\install-helper.ps1 -----------------------
:helper
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%HELPER%" %*
exit /b %errorlevel%

rem --- show_size FILE "note": print a file's size in MB --------------
:show_size
for %%f in (%1) do set SZ=%%~zf
set /a MB10=SZ * 10 / 1048576
if !MB10! LSS 10 set MB10=0!MB10!
set "ROW=%~1                    "
echo   !ROW:~0,20! !MB10:~0,-1!.!MB10:~-1! MB   %~2
exit /b 0

rem --- usage ---------------------------------------------------------
:usage
call :print_usage
goto :done

:usage_fail
call :print_usage
endlocal
exit /b 2

:print_usage
for /f "tokens=* delims=" %%l in ('findstr /B /C:"rem   build.bat" "%~f0"') do (
    set "L=%%l"
    echo !L:~4!
)
exit /b 0

:done
endlocal
exit /b 0

:error
echo.
echo ------------------------------------------------------------
echo  FAILED
echo ------------------------------------------------------------
endlocal
exit /b 1
