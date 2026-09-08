#!/usr/bin/env sh
#
# clean.sh - 빌드 결과를 지운다.
set -e

cd "$(dirname "$0")"
rm -rf out dist
echo "out/ 과 dist/ 를 지웠습니다."
