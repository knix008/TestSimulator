#!/usr/bin/env bash
# Runs every MyDeskSearch test and prints one aligned English line per result.
set -u
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

passed=0
failed=0
skipped=0
failed_names=
last_section=

c_reset=$'\033[0m'
c_green=$'\033[32m'
c_red=$'\033[31m'
c_yellow=$'\033[33m'
c_cyan=$'\033[36m'
c_gray=$'\033[90m'
c_white=$'\033[97m'
c_dim=$'\033[36m'

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

rule() {
    printf '  %s%s%s\n' "$c_dim" '--------------------------------------------------------------------' "$c_reset"
}

section() {
    if [ "$1" = "$last_section" ]; then
        return
    fi
    last_section=$1
    printf '\n  %s%s%s\n' "$c_cyan" "$1" "$c_reset"
}

add_result() {
    local status=$1 sec=$2 name=$3 detail=${4:-}
    local color time_color time_text
    case "$status" in
        PASS) passed=$((passed + 1)); color=$c_green ;;
        FAIL) failed=$((failed + 1)); color=$c_red; failed_names="${failed_names}"$'\n'"$name" ;;
        *) skipped=$((skipped + 1)); color=$c_yellow ;;
    esac
    if [ "$status" = SKIP ]; then
        time_text=$(printf '%8s' '-')
        time_color=$c_gray
    else
        time_text=$(printf '%8s' "${sec}s")
        time_color=$c_gray
        case "$sec" in
            [2-9].*|[1-9][0-9]*) time_color=$c_yellow ;;
        esac
    fi
    printf '  %s%-4s%s  %s%s%s   %s%s%s' "$color" "$status" "$c_reset" "$time_color" "$time_text" "$c_reset" "$c_white" "$name" "$c_reset"
    if [ -n "$detail" ]; then
        printf '   %s%s%s' "$c_red" "$detail" "$c_reset"
    fi
    printf '\n'
}

label_of() {
    local leaf=${1##*::}
    leaf=${leaf//_/ }
    printf '%s%s\n' "$(printf '%s' "$leaf" | cut -c1 | tr '[:lower:]' '[:upper:]')" "$(printf '%s' "$leaf" | cut -c2-)"
}

section_of() {
    local raw=$1 key
    case "$raw" in
        *::tests::*) key=${raw%%::tests::*} ;;
        *) key=features ;;
    esac
    case "$key" in
        color) printf '%s\n' 'Colors' ;;
        debounce) printf '%s\n' 'File watch debounce' ;;
        inclusion) printf '%s\n' 'Index scope' ;;
        instance) printf '%s\n' 'Single instance' ;;
        locale) printf '%s\n' 'Languages' ;;
        paths) printf '%s\n' 'Data paths' ;;
        platform) printf '%s\n' 'Startup entries' ;;
        query) printf '%s\n' 'Search grammar' ;;
        scan) printf '%s\n' 'Folder scan' ;;
        settings) printf '%s\n' 'Settings' ;;
        text) printf '%s\n' 'File names' ;;
        volume) printf '%s\n' 'Volumes' ;;
        features) printf '%s\n' 'Search and index' ;;
        *) printf '%s\n' "$key" ;;
    esac
}

receive_report() {
    report_saw=0
    report_code=0
    local line status sec name detail
    while IFS= read -r line; do
        case "$line" in
            MYDS\|META\|*)
                report_code=${line##*|}
                ;;
            MYDS\|*)
                IFS='|' read -r _ status sec name detail <<<"$line"
                report_saw=1
                add_result "$status" "$sec" "$name" "$detail"
                ;;
        esac
    done
}

run_reported() {
    receive_report < <(
        "$@"
        printf 'MYDS|META|0.000|exit|%s\n' "$?"
    )
}

start_ms=$(now_ms)
version=$(sed -n 's/^version *= *"\([^"]*\)".*/\1/p' Cargo.toml | head -n 1)
printf '\n  %sMyDeskSearch%s\n' "$c_cyan" "$c_reset"
printf '  %sVersion %s%s\n' "$c_dim" "${version:-unknown}" "$c_reset"
printf '  %sFeature tests%s\n' "$c_dim" "$c_reset"
rule

section 'Build'
build_log=$(mktemp)
build_start=$(now_ms)
set +e
cargo test --workspace --offline --locked --no-run --message-format=json --color never >"$build_log" 2>"$build_log.err"
build_code=$?
set +e
build_end=$(now_ms)
build_delta=$((build_end - build_start))
if [ "$build_delta" -lt 0 ]; then build_delta=0; fi
build_sec=$(printf '%d.%03d' "$((build_delta / 1000))" "$((build_delta % 1000))")
if [ "$build_code" -ne 0 ]; then
    tail=$(tr '\n' ' ' <"$build_log.err" | cut -c1-90)
    add_result FAIL "$build_sec" 'Compile test binaries' "${tail:-cargo failed}"
else
    add_result PASS "$build_sec" 'Compile test binaries'
    lib_exes=$(mktemp)
    other_exes=$(mktemp)
    while IFS= read -r line; do
        case "$line" in
            *'"reason":"compiler-artifact"'*'"test":true'*) ;;
            *) continue ;;
        esac
        exe=$(printf '%s\n' "$line" | sed -n 's/.*"executable":"\([^"]*\)".*/\1/p')
        [ -n "$exe" ] || continue
        exe=$(printf '%s' "$exe" | sed 's/\\\\/\\/g')
        case "$exe" in
            *features-*) printf '%s\n' "$exe" >>"$other_exes" ;;
            *) printf '%s\n' "$exe" >>"$lib_exes" ;;
        esac
    done <"$build_log"
    log=$(mktemp)
    while IFS= read -r exe; do
        [ -n "$exe" ] || continue
        [ -x "$exe" ] || [ -f "$exe" ] || continue
        while IFS= read -r item; do
            case "$item" in
                *': test'|*': ignore') ;;
                *) continue ;;
            esac
            name=${item%\: test}
            name=${name%\: ignore}
            label=$(label_of "$name")
            section "$(section_of "$name")"
            case "$item" in
                *': ignore')
                    add_result SKIP '0.000' "$label" 'ignored'
                    continue
                    ;;
            esac
            one_start=$(now_ms)
            set +e
            "$exe" "$name" --exact --test-threads=1 --color never >"$log" 2>&1
            code=$?
            set +e
            one_end=$(now_ms)
            one_delta=$((one_end - one_start))
            if [ "$one_delta" -lt 0 ]; then one_delta=0; fi
            one_sec=$(printf '%d.%03d' "$((one_delta / 1000))" "$((one_delta % 1000))")
            if [ "$code" -eq 0 ]; then
                add_result PASS "$one_sec" "$label"
            else
                detail=$(grep -E 'panicked|assertion|error' "$log" | head -n 1 | tr -s ' ')
                add_result FAIL "$one_sec" "$label" "${detail:-exited with code $code}"
            fi
        done < <("$exe" --list --color never 2>/dev/null)
    done < <(cat "$lib_exes" "$other_exes" | awk '!seen[$0]++')
    rm -f "$lib_exes" "$other_exes" "$log"
fi
rm -f "$build_log" "$build_log.err"

os=$(uname -s)
section 'Windows installer'
if [ "$os" = Linux ] || [ "$os" = Darwin ]; then
    add_result SKIP '0.000' 'Windows installer' 'this operating system is not Windows'
elif command -v powershell.exe >/dev/null 2>&1; then
    run_reported powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$root/packaging/windows/test-install.ps1"
    if [ "$report_saw" -eq 0 ]; then
        add_result FAIL '0.000' 'Windows installer suite' "exited with code $report_code and printed no results"
    fi
else
    add_result SKIP '0.000' 'Windows installer' 'powershell.exe was not found'
fi

section 'Linux and macOS installer'
if [ -f "$root/packaging/unix/test-install.sh" ]; then
    if command -v stdbuf >/dev/null 2>&1; then
        run_reported stdbuf -oL bash "$root/packaging/unix/test-install.sh"
    else
        run_reported bash "$root/packaging/unix/test-install.sh"
    fi
    if [ "$report_saw" -eq 0 ]; then
        add_result FAIL '0.000' 'Linux and macOS installer suite' "exited with code $report_code and printed no results"
    fi
fi

end_ms=$(now_ms)
wall_delta=$((end_ms - start_ms))
if [ "$wall_delta" -lt 0 ]; then wall_delta=0; fi
wall=$(printf '%d.%03ds' "$((wall_delta / 1000))" "$((wall_delta % 1000))")
total=$((passed + failed + skipped))
printf '\n'
rule
printf '  %sSummary%s\n\n' "$c_cyan" "$c_reset"
stat() {
    printf '  %s%-14s%s%s%8s%s\n' "$c_gray" "$1" "$c_reset" "$3" "$2" "$c_reset"
}
stat 'Passed' "$passed" "$c_green"
if [ "$failed" -gt 0 ]; then
    stat 'Failed' "$failed" "$c_red"
else
    stat 'Failed' "$failed" "$c_gray"
fi
stat 'Skipped' "$skipped" "$c_yellow"
stat 'Total' "$total" "$c_white"
stat 'Time' "$wall" "$c_cyan"
printf '\n'
if [ "$failed" -eq 0 ]; then
    printf '  %sResult        PASS%s\n' "$c_green" "$c_reset"
else
    printf '  %sResult        FAIL%s\n\n' "$c_red" "$c_reset"
    printf '  %sFailed tests%s\n' "$c_red" "$c_reset"
    printf '%s\n' "$failed_names" | sed '/^$/d; s/^/    /'
fi
printf '\n'
rule
printf '\n'
if [ "$failed" -gt 0 ]; then
    exit 1
fi
exit 0
