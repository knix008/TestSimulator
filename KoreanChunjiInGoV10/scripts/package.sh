#!/bin/sh
# package.sh - 설치용 파일을 만든다. (Linux / macOS)
#
#   ./scripts/package.sh
#   ./scripts/package.sh --skip-test
#
# 하는 일
#   1. 시험을 돌린다
#   2. 앱을 빌드한다                        -> chunjiin
#   3. 그 실행 파일을 설치 프로그램 안에 넣는다
#   4. 설치 프로그램을 빌드한다             -> chunjiin-setup
#   5. 배포용 묶음을 만든다
#        Linux  chunjiin-<판>-linux-<아키텍처>.tar.gz
#        macOS  Chunjiin.app + chunjiin-<판>-macos-<아키텍처>.dmg
#   6. 모두 저장소 루트에 둔다
#
# 다른 설치 도구(dpkg, rpm)를 필요로 하지 않는다.
# Go 로 짜인 GUI 설치기가 실행 파일을 자기 안에 품는다.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

version=1.0
skip_test=0
for arg in "$@"; do
    case "$arg" in
        --skip-test) skip_test=1 ;;
        --version=*) version=${arg#--version=} ;;
        -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
    esac
done

os=$(go env GOOS)
arch=$(go env GOARCH)
payload="$root/cmd/chunjiin-setup/payload"
ld_app="-s -w -X github.com/knix008/chunjiin/internal/ui.Version=$version"
ld_setup="-s -w -X main.Version=$version"

echo "== 천지인 설치용 파일 만들기  $version  ($os/$arch)"

if [ "$skip_test" -eq 0 ]; then
    echo "-- 시험"
    go test ./...
fi

echo "-- 앱 빌드"
go build -ldflags "$ld_app" -o chunjiin ./cmd/chunjiin

echo "-- 설치 프로그램에 넣기"
rm -f "$payload"/chunjiin "$payload"/chunjiin.exe
cp chunjiin "$payload/chunjiin"

cleanup() { rm -f "$payload"/chunjiin "$payload"/chunjiin.exe; }
trap cleanup EXIT

echo "-- 설치 프로그램 빌드"
go build -ldflags "$ld_setup" -o chunjiin-setup ./cmd/chunjiin-setup

if [ "$os" = "darwin" ]; then
    echo "-- 앱 묶음"
    app="$root/Chunjiin.app"
    rm -rf "$app"
    mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
    cp chunjiin "$app/Contents/MacOS/chunjiin"
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

    dmg="chunjiin-$version-macos-$arch.dmg"
    rm -f "$dmg"
    if command -v hdiutil >/dev/null 2>&1; then
        echo "-- dmg"
        stage=$(mktemp -d)
        cp -R "$app" "$stage/"
        ln -s /Applications "$stage/Applications"
        hdiutil create -volname "Chunjiin $version" -srcfolder "$stage" \
            -ov -format UDZO "$dmg" >/dev/null
        rm -rf "$stage"
    else
        echo "   hdiutil 이 없어 dmg 는 건너뛴다"
    fi
else
    echo "-- tar.gz"
    tgz="chunjiin-$version-linux-$arch.tar.gz"
    rm -f "$tgz"
    stage=$(mktemp -d)
    mkdir -p "$stage/chunjiin-$version"
    cp chunjiin chunjiin-setup "$stage/chunjiin-$version/"
    cp assets/chunjiin.png README.md UsersGuide.md "$stage/chunjiin-$version/"
    tar -czf "$tgz" -C "$stage" "chunjiin-$version"
    rm -rf "$stage"
fi

echo "== 완료"
for f in chunjiin chunjiin-setup chunjiin-*.tar.gz chunjiin-*.dmg; do
    [ -e "$f" ] && printf '   %-34s %s\n' "$f" "$(du -h "$f" | cut -f1)"
done
echo
echo "   chunjiin-setup 을 실행하면 사용자 홈 아래에 설치된다 (sudo 불필요)."
