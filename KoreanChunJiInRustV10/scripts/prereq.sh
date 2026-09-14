#!/bin/sh
# prereq.sh - rustc / cargo 가 없으면 rustup 으로 넣는다. (Linux / macOS)
#
# 호출하는 쪽에서 source 한다. PATH 변경이 그대로 이어지게 하기 위해서다.
#   . "$root/scripts/prereq.sh"
#
# 직접 실행해도 rustc 는 들어간다. 다만 그때 PATH 는 이 프로세스에서만 산다.
#
# 하는 일
#   1. ~/.cargo/bin 을 PATH 앞에 붙인다 (이미 넣었는데 창을 안 연 경우)
#   2. rustc · cargo 가 없으면 rustup 을 물어보지 않고 넣는다
#   3. rustc 가 1.85 보다 낮으면 rustup update 로 올린다
#
# rustup 설치는 https://sh.rustup.rs 를 쓰고, -y 로 기본값을 따른다.
# 이 파일은 set -e 인 스크립트에서 source 되므로, 조건이 아닌
# 줄에서 실패 상태를 남기지 않는다.

CARGO_BIN="${HOME}/.cargo/bin"
case ":${PATH}:" in
    *":${CARGO_BIN}:"*) ;;
    *) PATH="${CARGO_BIN}:${PATH}"; export PATH ;;
esac

prereq_die() {
    echo "$1" >&2
    return 1 2>/dev/null || exit 1
}

prereq_have_rust() {
    if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

prereq_install_rustup() {
    echo "   rustc 가 없습니다. rustup 으로 넣습니다..."
    if command -v curl >/dev/null 2>&1; then
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    else
        prereq_die "curl 또는 wget 이 없어 rustup 을 받을 수 없습니다. https://rustup.rs 를 보세요."
    fi
    if [ -f "${HOME}/.cargo/env" ]; then
        # shellcheck disable=SC1091
        . "${HOME}/.cargo/env"
    fi
    case ":${PATH}:" in
        *":${CARGO_BIN}:"*) ;;
        *) PATH="${CARGO_BIN}:${PATH}"; export PATH ;;
    esac
}

# rustc 가 없거나 1.85 보다 낮으면 0, 충분하면 1.
prereq_rustc_too_old() {
    ver=$(rustc --version 2>/dev/null | awk '{print $2}') || ver=
    if [ -z "$ver" ]; then
        return 0
    fi
    ver=${ver%%-*}
    major=${ver%%.*}
    rest=${ver#*.}
    minor=${rest%%.*}
    case "$major" in *[!0-9]*|'') return 0 ;; esac
    case "$minor" in *[!0-9]*|'') return 0 ;; esac
    if [ "$major" -lt 1 ]; then
        return 0
    fi
    if [ "$major" -eq 1 ] && [ "$minor" -lt 85 ]; then
        return 0
    fi
    return 1
}

if ! prereq_have_rust; then
    prereq_install_rustup
    if ! prereq_have_rust; then
        prereq_die "rustup 을 넣었는데 rustc 를 찾지 못했습니다. 터미널을 다시 열고 실행하세요."
    fi
fi

if prereq_rustc_too_old; then
    ver=$(rustc --version 2>/dev/null | awk '{print $2}') || ver='?'
    echo "   rustc $ver 는 1.85 보다 낮습니다. 올립니다..."
    if ! command -v rustup >/dev/null 2>&1; then
        prereq_die "rustc $ver 는 1.85 보다 낮고 rustup 이 없습니다. https://rustup.rs 를 보세요."
    fi
    rustup update stable
    rustup default stable
    if prereq_rustc_too_old; then
        prereq_die "rustc 를 올렸는데도 1.85 보다 낮습니다. rustup update stable 을 직접 해 보세요."
    fi
fi
