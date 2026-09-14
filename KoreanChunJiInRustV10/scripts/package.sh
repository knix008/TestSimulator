#!/bin/sh
# package.sh - 설치용 파일을 만든다. (Linux / macOS)
#
#   ./scripts/package.sh
#   ./scripts/package.sh --skip-test
#   ./scripts/package.sh --skip-web
#
# 하는 일
#   1. 시험을 돌린다
#   2. 웹 판을 만든다
#   3. 앱과 서버를 빌드한다                 -> chunjiin · chunjiin-serve
#   4. 그 실행 파일을 설치 프로그램 안에 넣는다
#   5. 설치 프로그램을 빌드한다             -> chunjiin-setup
#   6. 배포용 묶음을 만든다
#        Linux  chunjiin-<판>-linux-<아키텍처>.tar.gz
#        macOS  Chunjiin.app + chunjiin-<판>-macos-<아키텍처>.dmg
#   7. 모두 저장소 루트에 둔다
#
# 다른 설치 도구(dpkg, rpm)를 필요로 하지 않는다.
# Rust 로 짜인 GUI 설치기가 실행 파일을 자기 안에 품는다.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

version=1.0
skip_test=0
skip_web=0
for arg in "$@"; do
    case "$arg" in
        --skip-test) skip_test=1 ;;
        --skip-web) skip_web=1 ;;
        --version=*) version=${arg#--version=} ;;
        -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
    esac
done

# rustc 가 없으면 rustup 으로 넣는다. PATH 가 이어지게 source 한다.
. "$root/scripts/prereq.sh"
. "$root/scripts/cargo-out.sh"

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

if [ "$skip_test" -eq 0 ]; then
    echo "-- 시험"
    cargo run -q -p chunjiin-testreport
fi

if [ "$skip_web" -eq 0 ]; then
    echo "-- 웹 판"
    "$root/scripts/build-web.sh"
fi

echo "-- 앱 · 서버 빌드"
# 웹 판을 먼저 만들었으므로 서버가 그것을 품는다.
cargo build --release -p chunjiin-app -p chunjiin-serve
copy_cargo_bin chunjiin "$root" release
copy_cargo_bin chunjiin-serve "$root" release

echo "-- 설치 프로그램 빌드"
build_chunjiin_setup "$root" release build --release

if [ "$os" = "macos" ]; then
    echo "-- 앱 묶음"
    app="$root/Chunjiin.app"
    rm -rf "$app"
    mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
    cp "$root/chunjiin" "$app/Contents/MacOS/chunjiin"
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
    cp "$root/chunjiin-setup" "$stage/"
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
    cp "$root/chunjiin" "$root/chunjiin-setup" "$root/chunjiin-serve" "$pkg/"
    cp README.md UsersGuide.md "$pkg/" 2>/dev/null || true
    tar -czf "$tarball" -C "$stage" "chunjiin-$version"
    rm -rf "$stage"
fi

echo "== 만든 것"
for f in chunjiin chunjiin-setup chunjiin-serve \
         "chunjiin-$version-linux-$arch.tar.gz" \
         "chunjiin-$version-macos-$arch.dmg"; do
    [ -e "$root/$f" ] || continue
    printf '   %-38s %s\n' "$f" "$(du -h "$root/$f" | cut -f1)"
done
