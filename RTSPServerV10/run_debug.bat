@echo off
REM RTSP Server 실행 (디버그 모드)

echo ========================================
echo RTSP Server 실행 (디버그 모드)
echo ========================================
echo.
echo [실행 중..]

REM GST_DEBUG=3으로 상세한 로그 출력
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -here -c "GST_DEBUG=3 ./rtsp-server.exe 2>&1"

pause
