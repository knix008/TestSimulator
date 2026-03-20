@echo off
echo TLS 상호 인증 시스템 실행 스크립트
echo =====================================

echo.
echo 1. CA 서버 시작 중...
start "CA Server" cmd /k "python ca_server.py"

echo.
echo 2. 잠시 대기 후 인증서 발급...
timeout /t 3 /nobreak > nul

echo.
echo 3. 인증서 발급 중...
python test_certificates.py

echo.
echo 4. TLS 서버 빌드 및 실행...
cd TLSServer
start "TLS Server" cmd /k "dotnet run"
cd ..

echo.
echo 5. TLS 클라이언트 빌드 및 실행...
cd TLSClient
start "TLS Client" cmd /k "dotnet run"
cd ..

echo.
echo 모든 애플리케이션이 실행되었습니다!
echo.
echo 사용 방법:
echo 1. TLS 서버에서 "서버 시작" 버튼 클릭
echo 2. TLS 클라이언트에서 "연결" 버튼 클릭
echo 3. 메시지 통신 테스트
echo.
pause
