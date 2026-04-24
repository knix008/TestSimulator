#!/bin/bash

# 테스트 비디오 생성 스크립트
# GStreamer를 사용하여 테스트용 비디오 파일을 생성합니다

echo "테스트 비디오 파일 생성 중..."

# 10초짜리 테스트 비디오 생성 (컬러 바 패턴)
gst-launch-1.0 -e videotestsrc pattern=smpte num-buffers=300 ! \
    "video/x-raw,width=1280,height=720,framerate=30/1" ! \
    x264enc ! mp4mux ! filesink location=test_video.mp4

echo "테스트 비디오가 'test_video.mp4'로 생성되었습니다."
echo ""
echo "다른 패턴으로 생성하려면 pattern 값을 변경하세요:"
echo "  - smpte (컬러 바)"
echo "  - snow (눈 내리는 효과)"
echo "  - black (검은 화면)"
echo "  - white (흰 화면)"
echo "  - ball (움직이는 공)"
echo "  - circular (원형 패턴)"
