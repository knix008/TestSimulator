#!/bin/bash
# RTSP Server 실행 스크립트 (Linux)

echo "========================================"
echo "RTSP Server 실행"
echo "========================================"
echo

# 실행 파일 확인
if [ ! -f "rtsp-server" ]; then
    echo "[오류] rtsp-server 실행 파일이 없습니다!"
    echo
    echo "먼저 빌드를 실행하세요:"
    echo "  make"
    echo
    exit 1
fi

# 실행 권한 확인
if [ ! -x "rtsp-server" ]; then
    echo "[알림] 실행 권한 추가 중..."
    chmod +x rtsp-server
fi

echo "[실행 중...]"
echo "GTK 창이 열립니다..."
echo

./rtsp-server

echo
echo "프로그램이 종료되었습니다."
