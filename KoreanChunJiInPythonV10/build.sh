#!/bin/sh
# build.sh - 바로 실행할 수 있는 실행 파일을 만든다. (Linux / macOS)
#
#   ./build.sh              앱 · 서버 · 설치 프로그램을 만들고 설치 프로그램만 루트에 둔다
#   ./build.sh --run        빌드하지 않고 소스 그대로 실행한다 (가장 빠르다)
#   ./build.sh --web        빌드한 뒤 웹 판 서버까지 띄운다
#   ./build.sh --onedir     한 폴더로 묶는다 (빨리 뜨지만 폴더째 옮겨야 돈다)
#
# 기본은 한 파일 묶음이다. 루트에 놓인 실행 파일 하나만 있으면 그대로
# 돌아야 하기 때문이다. 대신 처음 뜰 때 몇 초 걸린다(자기를 임시 폴더에
# 푼다). 그것이 거슬리면 --onedir 로 만들어 dist/chunjiin/ 을 폴더째 쓴다.
#
# 파이썬은 컴파일이 없으므로 `--run` 은 언제나 방금 고친 코드를 그대로
# 돌린다. `./build.sh` 로 만든 실행 파일은 그 순간의 코드를 굳힌 것이라,
# 고친 것을 보려면 다시 만들어야 한다.
#
# 설치용 파일은 이 스크립트가 만들지 않는다. scripts/package.sh 를 쓴다.
#
# 필요한 것
#   Python 3.10 이상. PySide6 과 PyInstaller 는 없으면 pip 으로 저절로 넣는다
#   (scripts/ensure_deps.py). 망이 막힌 자리라면 먼저 넣어 두면 된다.
#       pip install PySide6 pyinstaller
set -eu

root=$(cd "$(dirname "$0")" && pwd)
cd "$root"

export PYTHONUTF8=1
# 있는 것을 찾는 것으로는 모자라다. Windows 의 `python3` 은 스토어로
# 데려가는 껍데기일 때가 있어서, 부르면 아무것도 하지 않고 끝난다.
# 그래서 정말로 도는지, 3.10 이상인지 실제로 물어 본다.
python=""
for candidate in python3 python py; do
    path=$(command -v "$candidate" 2>/dev/null) || continue
    ok='import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'
    "$path" -c "$ok" >/dev/null 2>&1 || continue
    python=$path
    break
done
if [ -z "$python" ]; then
    echo "파이썬 3.10 이상을 찾지 못했습니다." >&2
    exit 1
fi

run=0
web=0
onedir=0
for arg in "$@"; do
    case "$arg" in
        --run) run=1 ;;
        --web) web=1 ;;
        --onedir) onedir=1 ;;
        --onefile) onedir=0 ;;
        -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
    esac
done

# --run 은 묶지 않고 소스를 그대로 돌린다. 고친 것이 바로 보인다.
if [ "$run" -eq 1 ]; then
    echo "== 소스 그대로 실행 ($("$python" --version))"
    "$python" scripts/ensure_deps.py desktop || exit $?
    exec "$python" -m chunjiin
fi

echo "== 천지인 한글 입력기 빌드"
echo "   $("$python" --version)"

# 없는 것은 넣고 시작한다. 앱을 묶으려면 PySide6 도 있어야 한다.
"$python" scripts/ensure_deps.py desktop build || exit $?

mode="--onefile"
[ "$onedir" -eq 1 ] && mode="--onedir"

# 한 파일이면 설치 프로그램까지 만들어 그것 하나만 루트에 놓는다. 한 폴더
# 묶음은 실행 파일만 떼어 놓으면 딸린 파일이 없어 돌지 않으므로 dist/ 에
# 그대로 두고, 품을 수도 없으니 설치 프로그램은 만들지 않는다.
if [ "$onedir" -eq 1 ]; then
    echo "-- 데스크톱 앱 · 서버  ($mode)"
    "$python" scripts/pyinstaller_build.py "$mode" --targets app serve
else
    echo "-- 데스크톱 앱 · 서버 · 설치 프로그램  ($mode)"
    "$python" scripts/pyinstaller_build.py "$mode" --copy-root --targets app serve setup
fi

echo "== 빌드 완료"

if [ "$web" -eq 1 ]; then
    echo "-- 웹 판 서버"
    exec "$python" -m chunjiin.web
fi
