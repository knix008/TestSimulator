#!/bin/bash
# YOLO26Training 프로젝트 환경 설정 스크립트
set -e

# 1. 가상환경 생성
python3 -m venv venv

# 2. 가상환경 활성화
source venv/bin/activate

# 3. pip 업그레이드
pip install --upgrade pip

# 4. requirements.txt 패키지 설치
pip install -r requirements.txt

echo "[완료] 가상환경 및 패키지 설치가 완료되었습니다."
echo "가상환경 활성화: source venv/bin/activate"
