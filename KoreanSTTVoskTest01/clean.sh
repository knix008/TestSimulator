#!/usr/bin/env bash
# clean.sh
#
# 빌드 산출물을 지운다. 실행 파일이 루트에 놓이므로 build/ 만 지워서는 부족하다.
#
# 사용법:
#   ./clean.sh           # 빌드 산출물 (build/ + 루트의 실행 파일·런타임)
#   ./clean.sh --deps    # 위에 더해 내려받은 libvosk·모델까지 (완전 초기화)
#   ./clean.sh --dry-run # 무엇을 지울지 보여만 준다
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WITH_DEPS=0
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --deps) WITH_DEPS=1 ;;
        --dry-run|-n) DRY_RUN=1 ;;
        -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "알 수 없는 옵션: $1" >&2; exit 2 ;;
    esac
    shift
done

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }

removed=0
# 이름을 하나하나 적는다. 루트에서 와일드카드로 쓸어내면 사고가 난다.
remove() {
    local target="$ROOT/$1"
    [ -e "$target" ] || return 0
    if [ "$DRY_RUN" -eq 1 ]; then
        printf '    지울 것: %s\n' "$1"
    else
        rm -rf "$target"
        printf '    지움: %s\n' "$1"
    fi
    removed=$((removed + 1))
}

say "빌드 산출물을 지웁니다"
remove "build"

# glob 으로 실제 파일만 고른다. MSYS 에서 [ -e kstt-cli ] 는 kstt-cli.exe 에도
# 참이라, 이름을 하나씩 확인하면 같은 파일을 두 번 다루게 된다.
# 그래도 이름은 한 번 더 확인한다 — 루트에서 지우는 일이므로.
for candidate in "$ROOT"/kstt-*; do
    [ -e "$candidate" ] || continue
    base="$(basename "$candidate")"
    case "${base%.exe}" in
        kstt-cli|kstt-gui|kstt-gui-native|kstt-gui-gtk4|kstt-tests|kstt-gui-native.app)
            remove "$base" ;;
        *)
            printf '    건너뜀(모르는 파일): %s\n' "$base" ;;
    esac
done

# 실행 파일 옆에 복사해 둔 공유 라이브러리들
for lib in libvosk.dll libvosk.so libvosk.dylib \
           libstdc++-6.dll libgcc_s_seh-1.dll libwinpthread-1.dll; do
    remove "$lib"
done

if [ "$WITH_DEPS" -eq 1 ]; then
    say "내려받은 의존물도 지웁니다 (다시 받으려면 ./fetch_deps.sh)"
    remove "third_party"
    remove "models"
fi

if [ "$removed" -eq 0 ]; then
    say "지울 것이 없습니다 (이미 깨끗합니다)"
else
    say "끝났습니다 — ${removed}개 항목"
fi
