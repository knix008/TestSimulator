@echo off
rem Forward to the repository-root package.bat so that
rem   scripts\package.bat
rem and
rem   package.bat
rem do the same job. All option parsing lives in the root file.
call "%~dp0..\package.bat" %*
exit /b %errorlevel%
