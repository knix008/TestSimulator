#!/usr/bin/env sh
#
# clean.sh - 빌드가 만든 것을 지운다.
#
#   ./clean.sh           빌드 결과를 지운다 (out, dist, release, 루트로 복사한 설치 파일)
#   ./clean.sh --tools   내려받은 빌드 도구(tools/ 의 WiX)까지 지운다
#   ./clean.sh --all     위의 것을 모두 지운다
#   ./clean.sh --dry-run 지우지 않고 무엇이 지워질지만 보여 준다
#
# tools/ 는 기본으로 남긴다. 40MB 를 다시 내려받아야 하고, 그 안에는
# 빌드마다 새로 만들 것이 없기 때문이다.
#
# 저장소에 들어가는 것(src, docs/images, 문서, 스크립트)은 건드리지 않는다.
set -e

cd "$(dirname "$0")"

WITH_TOOLS=0
DRY=0

for arg in "$@"; do
  case "$arg" in
    --tools|--all) WITH_TOOLS=1 ;;
    --dry-run|-n) DRY=1 ;;
    -h|--help)
      sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
  esac
done

TOTAL_KB=0

# 있으면 지운다. 크기를 재어 얼마나 비웠는지 알려 준다.
drop() {
  target="$1"
  [ -e "$target" ] || return 0

  kb="$(du -sk "$target" 2>/dev/null | cut -f1)"
  [ -n "$kb" ] || kb=0
  TOTAL_KB=$((TOTAL_KB + kb))

  if [ "$DRY" -eq 1 ]; then
    printf '  지울 것   %-34s %6s MB\n' "$target" "$((kb / 1024))"
  else
    rm -rf "$target"
    printf '  지움      %-34s %6s MB\n' "$target" "$((kb / 1024))"
  fi
}

echo "빌드 결과"
drop out
drop dist
drop release

# package 스크립트가 손 닿는 자리에 두려고 루트로 복사해 둔 설치 파일
for f in Chunjiin-*.exe Chunjiin-*.msi Chunjiin-*.dmg Chunjiin-*.pkg \
         Chunjiin-*.deb Chunjiin-*.rpm Chunjiin-*.zip Chunjiin-*.tar.gz
do
  drop "$f"
done

if [ "$WITH_TOOLS" -eq 1 ]; then
  echo "내려받은 빌드 도구"
  drop tools
else
  if [ -d tools ]; then
    kb="$(du -sk tools 2>/dev/null | cut -f1)"
    printf '  남김      %-34s %6s MB   (--tools 로 지웁니다)\n' "tools" "$((kb / 1024))"
  fi
fi

echo ""
if [ "$TOTAL_KB" -eq 0 ]; then
  echo "지울 것이 없습니다. 이미 깨끗합니다."
elif [ "$DRY" -eq 1 ]; then
  echo "모두 $((TOTAL_KB / 1024)) MB 를 지울 수 있습니다. (--dry-run 이라 지우지 않았습니다)"
else
  echo "모두 $((TOTAL_KB / 1024)) MB 를 비웠습니다."
fi
