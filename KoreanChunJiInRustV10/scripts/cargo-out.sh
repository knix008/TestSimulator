# cargo-out.sh - cargo 가 실행 파일을 둔 폴더를 찾는다.
#
#   . "$root/scripts/cargo-out.sh"
#   out=$(cargo_profile_dir release)
#
# 호출하는 쪽이 source 한다.

cargo_profile_dir() {
    profile=${1:-release}
    json=$(cargo metadata --format-version 1 --no-deps 2>/dev/null) || {
        echo "cargo metadata 가 비었다. rustc / cargo 를 먼저 넣는다." >&2
        return 1
    }
    dir=$(printf '%s\n' "$json" | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p' | head -n 1)
    if [ -z "$dir" ]; then
        echo "cargo metadata 에 target_directory 가 없다." >&2
        return 1
    fi
    printf '%s/%s\n' "$dir" "$profile"
}

copy_cargo_bin() {
    name=$1
    dest=$2
    profile=${3:-release}
    src="$(cargo_profile_dir "$profile")/$name"
    if [ ! -f "$src" ]; then
        echo "빌드 결과가 없다: $src" >&2
        return 1
    fi
    cp "$src" "$dest/$name"
}

# 앱을 payload 에 넣고 설치 프로그램을 만든 뒤, 루트에 복사하고 payload 를 비운다.
# 나머지 인자는 cargo 에 그대로 넘긴다. (예: build --release)
build_chunjiin_setup() {
    root=$1
    profile=${2:-release}
    shift 2
    payload="$root/crates/setup/payload"
    app="$root/chunjiin"
    if [ ! -f "$app" ]; then
        echo "설치 프로그램이 품을 앱이 없다: $app" >&2
        return 1
    fi
    mkdir -p "$payload"
    rm -f "$payload"/chunjiin "$payload"/chunjiin.exe
    cp "$app" "$payload/chunjiin"
    if ! cargo "$@" -p chunjiin-setup; then
        rm -f "$payload"/chunjiin "$payload"/chunjiin.exe
        echo "설치 프로그램 빌드 실패" >&2
        return 1
    fi
    copy_cargo_bin chunjiin-setup "$root" "$profile"
    rm -f "$payload"/chunjiin "$payload"/chunjiin.exe
}
