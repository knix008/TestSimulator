#!/bin/sh
# package.sh - 설치용 파일을 만든다. (Linux / macOS)
#
#   ./scripts/package.sh
#   ./scripts/package.sh --skip-test
#   ./scripts/package.sh --version=1.0
#
# 하는 일
#   1. 시험을 돌린다
#   2. 앱과 서버를 한 파일로 빌드한다       -> chunjiin · chunjiin-serve
#   3. 그 앱을 설치 프로그램 안에 넣는다
#   4. 설치 프로그램을 한 파일로 빌드한다   -> chunjiin-setup
#   5. 배포용 묶음을 만든다
#        Linux  chunjiin-<판>-linux-<아키텍처>.tar.gz
#        macOS  Chunjiin.app + chunjiin-<판>-macos-<아키텍처>.dmg
#   6. 설치 프로그램만 저장소 루트에 둔다 (앱과 서버는 dist/ 에)
#
# 다른 설치 도구(dpkg, rpm)를 필요로 하지 않는다.
# 파이썬으로 짜인 GUI 설치기가 앱을 자기 안에 품는다.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
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

version=1.0
skip_test=0
for arg in "$@"; do
    case "$arg" in
        --skip-test) skip_test=1 ;;
        --version=*) version=${arg#--version=} ;;
        -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
    esac
done

case "$(uname -s)" in
    Darwin) os=macos ;;
    Linux)  os=linux ;;
    *)      os=$(uname -s | tr '[:upper:]' '[:lower:]') ;;
esac
arch=$(uname -m)
case "$arch" in
    x86_64) arch=amd64 ;;
    aarch64) arch=arm64 ;;
esac

echo "== 천지인 설치용 파일 만들기  $version  ($os/$arch)"

"$python" scripts/ensure_deps.py desktop build || exit $?

if [ "$skip_test" -eq 0 ]; then
    echo "-- 시험"
    QT_QPA_PLATFORM=offscreen "$python" -m tests.report
fi

echo "-- 앱 · 서버 · 설치 프로그램 빌드"
# 셋 다 한 파일로 만들되 루트에는 설치 프로그램만 놓는다. 설치 프로그램은
# 앞서 만든 앱을 자기 안에 품으므로 차례가 중요하다. pyinstaller_build.py 가 지킨다.
"$python" scripts/pyinstaller_build.py --clean --copy-root --targets app serve setup

# 앱과 서버는 dist/ 에, 설치 프로그램은 루트에 있다.
app_bin="$root/dist/chunjiin"
serve_bin="$root/dist/chunjiin-serve"
for f in "$app_bin" "$serve_bin" "$root/chunjiin-setup"; do
    [ -f "$f" ] && chmod +x "$f"
done

if [ "$os" = "macos" ]; then
    echo "-- 앱 묶음"
    app="$root/Chunjiin.app"
    rm -rf "$app"
    mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
    cp "$app_bin" "$app/Contents/MacOS/chunjiin"
    cp assets/chunjiin.png "$app/Contents/Resources/chunjiin.png"
    cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key><string>Chunjiin</string>
	<key>CFBundleDisplayName</key><string>Chunjiin</string>
	<key>CFBundleIdentifier</key><string>com.knix008.chunjiin</string>
	<key>CFBundleVersion</key><string>$version</string>
	<key>CFBundleShortVersionString</key><string>$version</string>
	<key>CFBundleExecutable</key><string>chunjiin</string>
	<key>CFBundleIconFile</key><string>chunjiin.png</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

    echo "-- 배포용 이미지"
    dmg="$root/chunjiin-$version-macos-$arch.dmg"
    rm -f "$dmg"
    stage=$(mktemp -d)
    cp -R "$app" "$stage/"
    cp "$root/chunjiin-setup" "$stage/" 2>/dev/null || true
    cp README.md UsersGuide.md "$stage/" 2>/dev/null || true
    ln -s /Applications "$stage/Applications" 2>/dev/null || true
    hdiutil create -quiet -volname Chunjiin -srcfolder "$stage" -ov -format UDZO "$dmg"
    rm -rf "$stage"
else
    echo "-- 배포용 묶음"
    tarball="$root/chunjiin-$version-linux-$arch.tar.gz"
    rm -f "$tarball"
    stage=$(mktemp -d)
    pkg="$stage/chunjiin-$version"
    mkdir -p "$pkg"
    cp "$app_bin" "$serve_bin" "$root/chunjiin-setup" "$pkg/"
    cp README.md UsersGuide.md "$pkg/" 2>/dev/null || true
    tar -czf "$tarball" -C "$stage" "chunjiin-$version"
    rm -rf "$stage"
fi

echo "== 만든 것"
for f in dist/chunjiin dist/chunjiin-serve chunjiin-setup Chunjiin.app \
         "chunjiin-$version-linux-$arch.tar.gz" \
         "chunjiin-$version-macos-$arch.dmg"; do
    [ -e "$root/$f" ] || continue
    [ "$f" = dist/chunjiin ] && [ ! -f "$root/$f" ] && continue
    printf '   %-38s %s\n' "$f" "$(du -sh "$root/$f" | cut -f1)"
done
