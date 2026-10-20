#!/usr/bin/env bash
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
installer=$here/install.sh
root=$(mktemp -d "${TMPDIR:-/tmp}/desksearch-install-test.XXXXXX")
home=$root/home
sys=$root/system
src=$root/src
mkdir -p "$src" "$home"
printf '#!/bin/sh\nprintf new-binary\\n\n' > "$src/mydesksearch"
chmod 755 "$src/mydesksearch"
printf 'keep-me\n' > "$home/keep-me"
mkdir -p "$sys"
printf 'keep-me\n' > "$sys/keep-me"
failures=0
reason_file=$root/reason.txt
: >"$reason_file"

cleanup() {
    rm -rf "$root"
}
trap cleanup EXIT

now_ms() {
    if [ -n "${EPOCHREALTIME:-}" ]; then
        local whole=${EPOCHREALTIME%%.*}
        local frac=${EPOCHREALTIME#*.}
        frac=${frac:0:3}
        while [ "${#frac}" -lt 3 ]; do frac=${frac}0; done
        printf '%d' "$((10#$whole * 1000 + 10#$frac))"
        return
    fi
    python3 -c 'import time; print(int(time.time() * 1000))'
}

emit() {
    printf 'MYDS|%s|%s|%s' "$1" "$2" "$3"
    if [ -n "${4:-}" ]; then
        printf '|%s' "$4"
    fi
    printf '\n'
}

die() {
    printf '%s\n' "$*" >"$reason_file"
    exit 1
}

run() {
    bash "$installer" --no-sudo --non-interactive --home "$home" --system-root "$sys" --source "$src/mydesksearch" "$@" >/dev/null 2>&1
}

run_case() {
    local name=$1
    shift
    : >"$reason_file"
    local start end code sec detail
    start=$(now_ms)
    set +e
    (
        set -e
        "$@"
    )
    code=$?
    set -e
    end=$(now_ms)
    local delta=$((end - start))
    if [ "$delta" -lt 0 ]; then delta=0; fi
    sec=$(printf '%d.%03d' "$((delta / 1000))" "$((delta % 1000))")
    if [ "$code" -eq 0 ]; then
        emit PASS "$sec" "$name"
    else
        detail=$(tr -d '\r' <"$reason_file")
        detail=${detail:-failed}
        detail=${detail//|/\/}
        emit FAIL "$sec" "$name" "$detail"
        failures=$((failures + 1))
    fi
}

case_prompts() {
    grep -q '언어를 선택하세요' "$installer" || die 'language prompt missing'
    grep -q '설정과 검색 인덱스를 삭제할까요' "$installer" || die 'data prompt missing'
    grep -q 'Keep leaves the language saved in the app' "$installer" || die 'keep explanation missing'
}

case_missing_language() {
    if run --os linux --user-data keep; then
        die 'missing language was accepted'
    fi
}

case_legacy_move() {
    mkdir -p "$home/.config/DeskSearch" "$home/.local/opt/desksearch"
    printf '{\n  "Language": "ko"\n}\n' > "$home/.config/DeskSearch/settings.json"
    printf 'legacy-index\n' > "$home/.config/DeskSearch/index.db"
    printf 'legacy-program\n' > "$home/.local/opt/desksearch/old-marker.txt"
    run --os linux --language en --user-data keep || die 'legacy install failed'
    test ! -e "$home/.local/opt/desksearch" || die 'previous DeskSearch program remained'
    test ! -d "$home/.config/DeskSearch" || die 'previous data directory was not moved'
    grep -q '"Language": "ko"' "$home/.config/MyDeskSearch/settings.json" || die 'kept language was not moved'
    grep -q 'legacy-index' "$home/.config/MyDeskSearch/index.db" || die 'index was not moved'
    rm -rf "$home/.config/MyDeskSearch" "$home/.local"
}

case_fresh() {
    run --os linux --language en --user-data keep || die 'fresh install failed'
    settings=$home/.config/MyDeskSearch/settings.json
    grep -q '"Language": "en"' "$settings" || die 'fresh install did not write English'
    test -x "$home/.local/opt/mydesksearch/mydesksearch" || die 'user binary missing'
    test -f "$home/.local/share/applications/mydesksearch.desktop" || die 'desktop file missing'
    test -L "$home/.local/bin/mydesksearch" || test -f "$home/.local/bin/mydesksearch" || die 'launcher missing'
    grep -q 'new-binary' "$home/.local/opt/mydesksearch/mydesksearch" || die 'binary content missing'
}

case_reinstall_keep() {
    settings=$home/.config/MyDeskSearch/settings.json
    mkdir -p "$home/.local/opt/mydesksearch" "$sys/opt/mydesksearch" "$home/.config/autostart"
    printf 'old\n' > "$home/.local/opt/mydesksearch/old-marker.txt"
    printf 'old-system\n' > "$sys/opt/mydesksearch/old-marker.txt"
    printf 'autostart\n' > "$home/.config/autostart/mydesksearch.desktop"
    printf 'index\n' > "$home/.config/MyDeskSearch/index.db"
    printf 'notes\n' > "$home/.config/MyDeskSearch/notes.txt"
    printf '{\n  "Language": "ko"\n}\n' > "$settings"
    run --os linux --language en --user-data keep || die 'reinstall failed'
    test ! -e "$home/.local/opt/mydesksearch/old-marker.txt" || die 'old program file remained'
    test ! -e "$sys/opt/mydesksearch/old-marker.txt" || die 'old system install remained'
    test ! -e "$home/.config/autostart/mydesksearch.desktop" || die 'autostart file remained'
    grep -q '"Language": "ko"' "$settings" || die 'kept language was overwritten'
    grep -q 'index' "$home/.config/MyDeskSearch/index.db" || die 'search index was removed'
    grep -q 'notes' "$home/.config/MyDeskSearch/notes.txt" || die 'user file was removed'
    grep -q 'keep-me' "$home/keep-me" || die 'home file outside MyDeskSearch was removed'
    grep -q 'keep-me' "$sys/keep-me" || die 'system file outside MyDeskSearch was removed'
}

case_delete() {
    settings=$home/.config/MyDeskSearch/settings.json
    run --os linux --language en --user-data delete || die 'delete install failed'
    test ! -e "$home/.config/MyDeskSearch/index.db" || die 'index remained after delete'
    test ! -e "$home/.config/MyDeskSearch/notes.txt" || die 'user file remained after delete'
    grep -q '"Language": "en"' "$settings" || die 'deleted data did not start in English'
}

case_system_install() {
    mkdir -p "$home/.local/opt/mydesksearch"
    printf 'user-copy\n' > "$home/.local/opt/mydesksearch/old-marker.txt"
    run --os linux --language ko --user-data keep --prefix / || die 'system install failed'
    test ! -e "$home/.local/opt/mydesksearch/old-marker.txt" || die 'per-user copy remained after system install'
    test -x "$sys/opt/mydesksearch/mydesksearch" || die 'system binary missing'
    test -f "$sys/usr/share/applications/mydesksearch.desktop" || die 'system desktop file missing'
    grep -q '/opt/mydesksearch/mydesksearch' "$sys/usr/share/applications/mydesksearch.desktop" || die 'desktop Exec path missing'
}

case_uninstall_keep() {
    settings=$home/.config/MyDeskSearch/settings.json
    bash "$sys/opt/mydesksearch/uninstall.sh" --os linux --non-interactive --no-sudo --user-data keep --home "$home" --system-root "$sys" --prefix / >/dev/null 2>&1 || die 'uninstall keep failed'
    test ! -e "$sys/opt/mydesksearch" || die 'system install remained after uninstall'
    test -f "$settings" || die 'settings were removed while keeping data'
}

case_macos_install() {
    run --os macos --language en --user-data keep || die 'macOS install failed'
    test -x "$home/Applications/MyDeskSearch.app/Contents/MacOS/mydesksearch" || die 'app binary missing'
    grep -q 'com.mydesksearch.app' "$home/Applications/MyDeskSearch.app/Contents/Info.plist" || die 'bundle id missing'
}

case_macos_reinstall() {
    mkdir -p "$home/Library/LaunchAgents" "$sys/Applications/MyDeskSearch.app"
    printf 'agent\n' > "$home/Library/LaunchAgents/com.mydesksearch.app.plist"
    printf 'old-app\n' > "$home/Applications/MyDeskSearch.app/old-marker.txt"
    printf 'old-system-app\n' > "$sys/Applications/MyDeskSearch.app/old-marker.txt"
    printf '{\n  "Language": "ko"\n}\n' > "$home/Library/Application Support/MyDeskSearch/settings.json"
    run --os macos --language en --user-data keep || die 'macOS reinstall failed'
    test ! -e "$home/Applications/MyDeskSearch.app/old-marker.txt" || die 'old app file remained'
    test ! -e "$sys/Applications/MyDeskSearch.app" || die 'old system app remained'
    test ! -e "$home/Library/LaunchAgents/com.mydesksearch.app.plist" || die 'launch agent remained'
    grep -q '"Language": "ko"' "$home/Library/Application Support/MyDeskSearch/settings.json" || die 'macOS language was not kept'
}

case_macos_delete() {
    bash "$home/Applications/MyDeskSearch.app/Contents/Resources/uninstall.sh" --non-interactive --no-sudo --user-data delete --os macos --home "$home" --system-root "$sys" >/dev/null 2>&1 || die 'macOS uninstall failed'
    test ! -e "$home/Applications/MyDeskSearch.app" || die 'app remained after uninstall'
    test ! -e "$home/Library/Application Support/MyDeskSearch" || die 'macOS data remained after delete'
}

case_unsafe_data_dir() {
    if run --os linux --language en --user-data keep --data-dir "$root/not-desksearch"; then
        die 'unsafe data directory was accepted'
    fi
}

case_prompt_answers() {
    answers=$root/answers
    rm -rf "$home/.config/MyDeskSearch"
    run --os linux --phase prompts --language en --answer-file "$answers" || die 'prompt phase failed'
    grep -q '^LANGUAGE=en$' "$answers" || die 'answer file language missing'
    grep -q '^USER_DATA=keep$' "$answers" || die 'answer file data choice missing'
}

run_case 'Installer offers Korean and English prompts' case_prompts
run_case 'Installer rejects a missing language' case_missing_language
run_case 'Legacy DeskSearch data is moved when kept' case_legacy_move
run_case 'Fresh install writes English' case_fresh
run_case 'Reinstall replaces the program and keeps user data' case_reinstall_keep
run_case 'Delete removes user data and writes English' case_delete
run_case 'System install replaces the per-user copy' case_system_install
run_case 'Uninstall while keeping data removes the program only' case_uninstall_keep
run_case 'macOS app bundle is installed' case_macos_install
run_case 'macOS reinstall keeps the language and removes the old app' case_macos_reinstall
run_case 'macOS uninstall delete removes the app and data' case_macos_delete
run_case 'Installer rejects an unsafe data directory' case_unsafe_data_dir
run_case 'Prompt phase records the language and data choice' case_prompt_answers

if [ "$failures" -gt 0 ]; then
    exit 1
fi
exit 0
