#!/bin/bash

# RTSP Server 의존성 설치 스크립트 (Fedora/RHEL/CentOS)

echo "========================================"
echo "RTSP Server 의존성 설치 (Fedora/RHEL)"
echo "========================================"
echo

# Root 권한 확인
if [ "$EUID" -ne 0 ]; then 
    echo "[알림] 이 스크립트는 sudo 권한이 필요합니다."
    echo "sudo로 다시 실행합니다..."
    echo
    exec sudo bash "$0" "$@"
    exit
fi

# 개발 도구 설치
echo "[1/3] 개발 도구 설치 중..."
echo
dnf install -y gcc make pkg-config

if [ $? -ne 0 ]; then
    echo "[오류] 개발 도구 설치 실패"
    exit 1
fi

# GTK3 설치
echo
echo "[2/3] GTK3 설치 중..."
echo
dnf install -y gtk3-devel

if [ $? -ne 0 ]; then
    echo "[오류] GTK3 설치 실패"
    exit 1
fi

# GStreamer 및 RTSP 서버 라이브러리 설치
echo
echo "[3/3] GStreamer 및 RTSP 서버 라이브러리 설치 중..."
echo "이 작업은 시간이 걸릴 수 있습니다..."
echo
dnf install -y \
    gstreamer1-devel \
    gstreamer1-plugins-base-devel \
    gstreamer1-plugins-good \
    gstreamer1-plugins-bad-free \
    gstreamer1-plugins-ugly-free \
    gstreamer1-rtsp-server-devel

if [ $? -ne 0 ]; then
    echo "[오류] GStreamer 라이브러리 설치 실패"
    exit 1
fi

echo
echo "========================================"
echo "설치 완료!"
echo "========================================"
echo
echo "설치된 패키지:"
echo "- GCC 컴파일러"
echo "- Make 빌드 도구"
echo "- pkg-config"
echo "- GTK3 GUI 라이브러리"
echo "- GStreamer 멀티미디어 프레임워크"
echo "- GStreamer 플러그인 (base, good, bad, ugly)"
echo "- GStreamer RTSP 서버 라이브러리"
echo
echo "빌드 방법:"
echo "1. cd ~/Projects/TestSimulator/RTSPServerV10"
echo "2. make"
echo "3. ./rtsp-server"
echo
