#!/usr/bin/env bash
# MyDeskSearch installer for Linux and macOS.
# Choose Korean or English, remove an existing program, then install a fresh copy.
# Settings and the search index are removed only when the user asks for that.
set -euo pipefail

if [ -z "${DESKSEARCH_INSTALL_REEXEC:-}" ]; then
    origin=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
    export DESKSEARCH_INSTALL_ORIGIN="$origin"
    export DESKSEARCH_INSTALL_REEXEC=1
    tmp=$(mktemp "${TMPDIR:-/tmp}/mydesksearch-install.XXXXXX")
    cp "$0" "$tmp"
    chmod 700 "$tmp"
    exec bash "$tmp" "$@"
fi

ORIGIN="${DESKSEARCH_INSTALL_ORIGIN:-}"
OS=""
LANGUAGE=""
USER_DATA=""
NONINTERACTIVE=0
SOURCE=""
HOME_DIR="${HOME}"
SYSTEM_ROOT=""
PREFIX=""
DATA_DIR=""
PHASE=""
VERSION=""
UNINSTALL=0
NO_SUDO=0
ANSWER_FILE=""
STAGE=""
REMOVE_DIRS=()
REMOVE_FILES=()
DEST_DIR=""
DEST_BIN=""
DEST_LINK=""
DEST_DESKTOP=""
DEST_APP=""

usage() {
    cat <<'EOF'
Usage: install.sh --os linux|macos [options]

  --language ko|en          Interface language for a new settings file
  --user-data keep|delete   Keep or delete settings and the search index
  --non-interactive         Fail instead of prompting
  --source PATH             mydesksearch binary to install
  --home PATH               Home directory used for data and per-user files
  --system-root PATH        Prefix for /opt, /usr, and /Applications
  --prefix PATH             Install location (/ for a system install)
  --data-dir PATH           Override the MyDeskSearch data directory
  --phase all|prompts|remove|data
  --uninstall               Remove the program and ask about user data
  --answer-file PATH        Write LANGUAGE and USER_DATA after prompting
  --version VERSION
  --no-sudo                 Do not use sudo when a path is not writable
EOF
}

die() {
    printf 'MyDeskSearch: %s\n' "$*" >&2
    exit 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        --os) OS=${2:-}; shift 2 ;;
        --language) LANGUAGE=${2:-}; shift 2 ;;
        --user-data) USER_DATA=${2:-}; shift 2 ;;
        --non-interactive) NONINTERACTIVE=1; shift ;;
        --source) SOURCE=${2:-}; shift 2 ;;
        --home) HOME_DIR=${2:-}; shift 2 ;;
        --system-root) SYSTEM_ROOT=${2:-}; shift 2 ;;
        --prefix) PREFIX=${2:-}; shift 2 ;;
        --data-dir) DATA_DIR=${2:-}; shift 2 ;;
        --phase) PHASE=${2:-}; shift 2 ;;
        --uninstall) UNINSTALL=1; shift ;;
        --answer-file) ANSWER_FILE=${2:-}; shift 2 ;;
        --version) VERSION=${2:-}; shift 2 ;;
        --no-sudo) NO_SUDO=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) die "unknown argument: $1" ;;
    esac
done

if [ -z "$OS" ]; then
    case "$(uname -s)" in
        Linux) OS=linux ;;
        Darwin) OS=macos ;;
        *) die "On Windows, run packaging/windows/install.ps1." ;;
    esac
fi
case "$OS" in
    linux|macos) ;;
    *) die "unsupported operating system: $OS" ;;
esac
if [ -z "$PHASE" ]; then
    if [ "$UNINSTALL" = 1 ]; then
        PHASE=uninstall
    else
        PHASE=all
    fi
fi
if [ -z "$SOURCE" ] && [ -n "$ORIGIN" ] && [ -f "$ORIGIN/mydesksearch" ]; then
    SOURCE=$ORIGIN/mydesksearch
fi
if [ -z "$VERSION" ] && [ -n "$ORIGIN" ] && [ -f "$ORIGIN/version.txt" ]; then
    VERSION=$(tr -d '[:space:]' < "$ORIGIN/version.txt")
fi
if [ -z "$VERSION" ]; then
    VERSION=1.0.1
fi

sys_path() {
    rest=$1
    if [ -z "$SYSTEM_ROOT" ] || [ "$SYSTEM_ROOT" = / ]; then
        printf '%s' "$rest"
    else
        printf '%s%s' "${SYSTEM_ROOT%/}" "$rest"
    fi
}

resolve_paths() {
    REMOVE_DIRS=()
    REMOVE_FILES=()
    if [ -z "$DATA_DIR" ]; then
        if [ "$OS" = linux ]; then
            if [ -n "${XDG_CONFIG_HOME:-}" ] && [ "$HOME_DIR" = "${HOME}" ]; then
                DATA_DIR=${XDG_CONFIG_HOME}/MyDeskSearch
            else
                DATA_DIR=$HOME_DIR/.config/MyDeskSearch
            fi
        else
            DATA_DIR="$HOME_DIR/Library/Application Support/MyDeskSearch"
        fi
    fi
    case "$DATA_DIR" in
        */MyDeskSearch|*/DeskSearch) ;;
        *) die "refusing to change data directory $DATA_DIR" ;;
    esac
    if [ -z "$PREFIX" ]; then
        if [ "$OS" = linux ]; then
            PREFIX=$HOME_DIR/.local
        else
            PREFIX=$HOME_DIR
        fi
    fi
    if [ "$OS" = linux ]; then
        if [ "$PREFIX" = / ]; then
            DEST_DIR=$(sys_path /opt/mydesksearch)
            DEST_LINK=$(sys_path /usr/local/bin/mydesksearch)
            DEST_DESKTOP=$(sys_path /usr/share/applications/mydesksearch.desktop)
        else
            DEST_DIR=$PREFIX/opt/mydesksearch
            DEST_LINK=$PREFIX/bin/mydesksearch
            DEST_DESKTOP=$PREFIX/share/applications/mydesksearch.desktop
        fi
        DEST_BIN=$DEST_DIR/mydesksearch
        REMOVE_DIRS+=("$HOME_DIR/.local/opt/mydesksearch")
        REMOVE_FILES+=("$HOME_DIR/.local/bin/mydesksearch")
        REMOVE_FILES+=("$HOME_DIR/.local/share/applications/mydesksearch.desktop")
        REMOVE_FILES+=("$HOME_DIR/.config/autostart/mydesksearch.desktop")
        REMOVE_DIRS+=("$(sys_path /opt/mydesksearch)")
        REMOVE_FILES+=("$(sys_path /usr/local/bin/mydesksearch)")
        REMOVE_FILES+=("$(sys_path /usr/share/applications/mydesksearch.desktop)")
    else
        if [ "$PREFIX" = / ]; then
            DEST_APP=$(sys_path /Applications/MyDeskSearch.app)
        else
            DEST_APP=$PREFIX/Applications/MyDeskSearch.app
        fi
        DEST_DIR=$DEST_APP
        DEST_BIN=$DEST_APP/Contents/MacOS/mydesksearch
        REMOVE_DIRS+=("$HOME_DIR/Applications/MyDeskSearch.app")
        REMOVE_DIRS+=("$(sys_path /Applications/MyDeskSearch.app)")
        REMOVE_FILES+=("$HOME_DIR/Library/LaunchAgents/com.mydesksearch.app.plist")
        REMOVE_DIRS+=("$HOME_DIR/Applications/DeskSearch.app")
        REMOVE_DIRS+=("$(sys_path /Applications/DeskSearch.app)")
        REMOVE_FILES+=("$HOME_DIR/Library/LaunchAgents/com.desksearch.app.plist")
    fi
    if [ "$OS" = linux ]; then
        REMOVE_DIRS+=("$HOME_DIR/.local/opt/desksearch")
        REMOVE_FILES+=("$HOME_DIR/.local/bin/desksearch")
        REMOVE_FILES+=("$HOME_DIR/.local/share/applications/desksearch.desktop")
        REMOVE_FILES+=("$HOME_DIR/.config/autostart/desksearch.desktop")
        REMOVE_DIRS+=("$(sys_path /opt/desksearch)")
        REMOVE_FILES+=("$(sys_path /usr/local/bin/desksearch)")
        REMOVE_FILES+=("$(sys_path /usr/share/applications/desksearch.desktop)")
    fi
}

program_exists() {
    local path
    for path in "${REMOVE_DIRS[@]+"${REMOVE_DIRS[@]}"}" "${REMOVE_FILES[@]+"${REMOVE_FILES[@]}"}"; do
        if [ -e "$path" ] || [ -L "$path" ]; then
            return 0
        fi
    done
    return 1
}

legacy_data_dir() {
    case "$DATA_DIR" in
        */MyDeskSearch) printf '%s/DeskSearch' "${DATA_DIR%/MyDeskSearch}" ;;
    esac
}

data_exists() {
    local dir names
    for dir in "$DATA_DIR" "$(legacy_data_dir)"; do
        [ -n "$dir" ] || continue
        [ -d "$dir" ] || continue
        names=$(ls -A "$dir" 2>/dev/null || true)
        if [ -n "$names" ]; then
            return 0
        fi
    done
    return 1
}

msg() {
    if [ "$LANGUAGE" = en ]; then
        case "$1" in
            reinstall) printf '%s\n' 'MyDeskSearch is already installed. Its program files will be removed and installed again.' ;;
            ask) printf '%s\n' 'Delete settings and the search index? Keep leaves the language saved in the app. Delete starts in the language you just chose.' ;;
            keep) printf '%s\n' 'Keep' ;;
            delete) printf '%s\n' 'Delete' ;;
            done) printf '%s\n' 'MyDeskSearch is installed.' ;;
            removed) printf '%s\n' 'MyDeskSearch was removed.' ;;
            *) printf '%s\n' "$1" ;;
        esac
    else
        case "$1" in
            reinstall) printf '%s\n' '이미 설치된 MyDeskSearch가 있습니다. 프로그램 파일을 모두 지운 다음 새로 설치합니다.' ;;
            ask) printf '%s\n' '설정과 검색 인덱스를 삭제할까요? 유지하면 앱에 저장된 언어도 그대로 남습니다. 삭제하면 지금 고른 언어로 시작합니다.' ;;
            keep) printf '%s\n' '유지' ;;
            delete) printf '%s\n' '삭제' ;;
            done) printf '%s\n' 'MyDeskSearch를 설치했습니다.' ;;
            removed) printf '%s\n' 'MyDeskSearch를 제거했습니다.' ;;
            *) printf '%s\n' "$1" ;;
        esac
    fi
}

prompt_language() {
    if [ -n "$LANGUAGE" ]; then
        return 0
    fi
    if [ "$NONINTERACTIVE" = 1 ]; then
        die "--language ko or --language en is required"
    fi
    if [ "$OS" = macos ] && command -v osascript >/dev/null 2>&1; then
        LANGUAGE=$(osascript <<'EOF' || die "language selection was cancelled"
set choice to choose from list {"한국어", "English"} with title "MyDeskSearch" with prompt "Select a language / 언어를 선택하세요." default items {"한국어"}
if choice is false then error number -128
return item 1 of choice
EOF
        )
        case "$LANGUAGE" in
            English|en) LANGUAGE=en ;;
            *) LANGUAGE=ko ;;
        esac
        return 0
    fi
    if command -v whiptail >/dev/null 2>&1 && [ -t 0 ]; then
        LANGUAGE=$(whiptail --title "MyDeskSearch" --menu "Select a language / 언어를 선택하세요." 15 70 2 \
            ko "한국어" \
            en "English" \
            3>&1 1>&2 2>&3) || die "language selection was cancelled"
        return 0
    fi
    [ -t 0 ] || die "no terminal; pass --language and --user-data"
    printf '%s\n' 'Select a language / 언어를 선택하세요.'
    printf '%s\n' '1) 한국어'
    printf '%s\n' '2) English'
    read -r choice || die "language selection was cancelled"
    case "$choice" in
        2|en|English) LANGUAGE=en ;;
        1|ko|"") LANGUAGE=ko ;;
        *) die "language must be ko or en" ;;
    esac
}

prompt_user_data() {
    local need=0
    if program_exists || data_exists; then
        need=1
    fi
    if [ "$need" = 0 ]; then
        if [ -z "$USER_DATA" ]; then
            USER_DATA=keep
        fi
        return 0
    fi
    if [ -n "$USER_DATA" ]; then
        return 0
    fi
    if [ "$NONINTERACTIVE" = 1 ]; then
        die "--user-data keep or --user-data delete is required"
    fi
    if [ "$OS" = macos ] && command -v osascript >/dev/null 2>&1; then
        local keep_label delete_label text chosen
        keep_label=$(msg keep)
        delete_label=$(msg delete)
        text=$(printf '%s\n\n%s' "$(msg reinstall)" "$(msg ask)")
        chosen=$(osascript - "$text" "$keep_label" "$delete_label" <<'EOF' || die "user data choice was cancelled"
on run argv
    set dialogText to item 1 of argv
    set keepLabel to item 2 of argv
    set deleteLabel to item 3 of argv
    set response to display dialog dialogText buttons {keepLabel, deleteLabel} default button keepLabel with title "MyDeskSearch"
    return button returned of response
end run
EOF
        )
        if [ "$chosen" = "$(msg delete)" ]; then
            USER_DATA=delete
        else
            USER_DATA=keep
        fi
        return 0
    fi
    if command -v whiptail >/dev/null 2>&1 && [ -t 0 ]; then
        local prompt
        prompt=$(printf '%s\n\n%s' "$(msg reinstall)" "$(msg ask)")
        USER_DATA=$(whiptail --title "MyDeskSearch" --menu "$prompt" 20 78 2 \
            keep "$(msg keep)" \
            delete "$(msg delete)" \
            3>&1 1>&2 2>&3) || die "user data choice was cancelled"
        return 0
    fi
    [ -t 0 ] || die "no terminal; pass --user-data keep or --user-data delete"
    printf '%s\n\n%s\n' "$(msg reinstall)" "$(msg ask)"
    printf '1) %s\n' "$(msg keep)"
    printf '2) %s\n' "$(msg delete)"
    read -r choice || die "user data choice was cancelled"
    case "$choice" in
        2|delete|Delete) USER_DATA=delete ;;
        *) USER_DATA=keep ;;
    esac
}

read_saved_language() {
    local settings=$DATA_DIR/settings.json
    [ -f "$settings" ] || return 1
    local saved
    saved=$(sed -n 's/.*"Language"[[:space:]]*:[[:space:]]*"\([a-z][a-z]\)".*/\1/p' "$settings" | head -n 1 || true)
    case "$saved" in
        ko|en) printf '%s' "$saved" ;;
        *) return 1 ;;
    esac
}

do_prompts() {
    if [ "$UNINSTALL" = 1 ] && [ -z "$LANGUAGE" ]; then
        local saved
        saved=$(read_saved_language || true)
        if [ -n "$saved" ]; then
            LANGUAGE=$saved
        else
            LANGUAGE=ko
        fi
    fi
    prompt_language
    case "$LANGUAGE" in
        ko|en) ;;
        *) die "language must be ko or en" ;;
    esac
    prompt_user_data
    case "$USER_DATA" in
        keep|delete) ;;
        *) die "user data must be keep or delete" ;;
    esac
    if [ -n "$ANSWER_FILE" ]; then
        umask 077
        printf 'LANGUAGE=%s\nUSER_DATA=%s\n' "$LANGUAGE" "$USER_DATA" > "$ANSWER_FILE"
    fi
}

stop_path() {
    local target=$1
    [ -n "$target" ] || return 0
    local listing
    listing=$(ps -ax -o pid=,command= 2>/dev/null || ps -eo pid=,args= 2>/dev/null || true)
    [ -n "$listing" ] || return 0
    local pid args
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        pid=$(printf '%s\n' "$line" | awk '{print $1}')
        args=$(printf '%s\n' "$line" | sed 's/^[[:space:]]*[0-9][0-9]*[[:space:]]*//')
        case "$args" in
            "$target"|"$target "*)
                kill "$pid" 2>/dev/null || true
                ;;
        esac
    done <<< "$listing"
}

remove_file() {
    local path=$1
    [ -n "$path" ] || die "refusing to remove an empty path"
    case "$path" in
        */mydesksearch|*/desksearch|*/mydesksearch.desktop|*/desksearch.desktop|*/com.mydesksearch.app.plist|*/com.desksearch.app.plist) ;;
        *) die "refusing to remove $path" ;;
    esac
    [ -e "$path" ] || [ -L "$path" ] || return 0
    if rm -f "$path" 2>/dev/null; then
        return 0
    fi
    if [ "$NO_SUDO" = 1 ] || ! command -v sudo >/dev/null 2>&1; then
        die "could not remove $path"
    fi
    sudo rm -f "$path" || die "could not remove $path"
}

remove_tree() {
    local path=$1
    [ -n "$path" ] || die "refusing to remove an empty path"
    case "$path" in
        /|"$HOME_DIR"|"${HOME}") die "refusing to remove $path" ;;
        */mydesksearch|*/desksearch|*/MyDeskSearch.app|*/DeskSearch.app) ;;
        *) die "refusing to remove $path" ;;
    esac
    [ -e "$path" ] || [ -L "$path" ] || return 0
    if rm -rf "$path" 2>/dev/null; then
        return 0
    fi
    if [ "$NO_SUDO" = 1 ] || ! command -v sudo >/dev/null 2>&1; then
        die "could not remove $path"
    fi
    sudo rm -rf "$path" || die "could not remove $path"
}

stop_known() {
    local path
    for path in "${REMOVE_FILES[@]+"${REMOVE_FILES[@]}"}"; do
        stop_path "$path"
    done
    for path in "${REMOVE_DIRS[@]+"${REMOVE_DIRS[@]}"}"; do
        if [ "$OS" = linux ]; then
            stop_path "$path/mydesksearch"
            stop_path "$path/desksearch"
        else
            stop_path "$path/Contents/MacOS/mydesksearch"
            stop_path "$path/Contents/MacOS/desksearch"
        fi
    done
}

remove_programs() {
    local path
    stop_known
    for path in "${REMOVE_FILES[@]+"${REMOVE_FILES[@]}"}"; do
        remove_file "$path"
    done
    for path in "${REMOVE_DIRS[@]+"${REMOVE_DIRS[@]}"}"; do
        remove_tree "$path"
    done
}

write_uninstall() {
    local dir=$1
    cat > "$dir/uninstall.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec bash "$here/install.sh" --uninstall "$@"
EOF
    chmod 755 "$dir/uninstall.sh"
}

write_desktop() {
    local dest=$1
    local executable=$2
    mkdir -p "$(dirname -- "$dest")"
    cat > "$dest" <<EOF
[Desktop Entry]
Type=Application
Name=MyDeskSearch
GenericName=File name search
Comment=Search file and folder names
Exec="${executable}"
Terminal=false
Categories=Utility;
StartupNotify=false
EOF
}

write_plist() {
    local dest=$1
    cat > "$dest" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>MyDeskSearch</string>
  <key>CFBundleDisplayName</key><string>MyDeskSearch</string>
  <key>CFBundleIdentifier</key><string>com.mydesksearch.app</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>mydesksearch</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF
}

install_linux() {
    mkdir -p "$DEST_DIR" "$(dirname -- "$DEST_LINK")" "$(dirname -- "$DEST_DESKTOP")"
    cp "$STAGE/mydesksearch" "$DEST_BIN"
    chmod 755 "$DEST_BIN"
    cp "$STAGE/install.sh" "$DEST_DIR/install.sh"
    chmod 755 "$DEST_DIR/install.sh"
    write_uninstall "$DEST_DIR"
    ln -sfn "$DEST_BIN" "$DEST_LINK"
    write_desktop "$DEST_DESKTOP" "$DEST_BIN"
}

install_macos() {
    mkdir -p "$DEST_APP/Contents/MacOS" "$DEST_APP/Contents/Resources"
    cp "$STAGE/mydesksearch" "$DEST_BIN"
    chmod 755 "$DEST_BIN"
    cp "$STAGE/install.sh" "$DEST_APP/Contents/Resources/install.sh"
    chmod 755 "$DEST_APP/Contents/Resources/install.sh"
    write_uninstall "$DEST_APP/Contents/Resources"
    write_plist "$DEST_APP/Contents/Info.plist"
}

install_files() {
    if [ -z "$SOURCE" ] || [ ! -f "$SOURCE" ]; then
        die "install source was not found"
    fi
    STAGE=$(mktemp -d "${TMPDIR:-/tmp}/mydesksearch-stage.XXXXXX")
    cp "$SOURCE" "$STAGE/mydesksearch"
    chmod 755 "$STAGE/mydesksearch"
    cp "$0" "$STAGE/install.sh"
    chmod 755 "$STAGE/install.sh"
    remove_programs
    if [ "$OS" = linux ]; then
        install_linux
    else
        install_macos
    fi
}

apply_data() {
    local mode=$1
    local settings=$DATA_DIR/settings.json
    local legacy
    legacy=$(legacy_data_dir || true)
    if [ "$USER_DATA" = delete ]; then
        rm -rf "$DATA_DIR"
        if [ -n "$legacy" ] && [ "$legacy" != "$DATA_DIR" ]; then
            case "$legacy" in
                */DeskSearch) rm -rf "$legacy" ;;
            esac
        fi
    elif [ -n "$legacy" ] && [ ! -e "$DATA_DIR" ] && [ -d "$legacy" ]; then
        mkdir -p "$(dirname -- "$DATA_DIR")"
        mv "$legacy" "$DATA_DIR"
    fi
    if [ "$mode" = uninstall ]; then
        return 0
    fi
    if [ "$USER_DATA" = delete ] || [ ! -f "$settings" ]; then
        mkdir -p "$DATA_DIR"
        printf '{\n  "Language": "%s"\n}\n' "$LANGUAGE" > "$settings"
    fi
}

cleanup() {
    if [ -n "$STAGE" ] && [ -d "$STAGE" ]; then
        rm -rf "$STAGE"
    fi
    if [ "${DESKSEARCH_INSTALL_REEXEC:-}" = 1 ] && [ -n "${0:-}" ] && [ "$0" != "$ORIGIN/install.sh" ]; then
        rm -f "$0" 2>/dev/null || true
    fi
}
trap cleanup EXIT

resolve_paths
case "$PHASE" in
    prompts)
        do_prompts
        ;;
    remove)
        remove_programs
        ;;
    data)
        do_prompts
        apply_data install
        ;;
    uninstall)
        do_prompts
        remove_programs
        apply_data uninstall
        printf '%s\n' "$(msg removed)"
        ;;
    all)
        do_prompts
        install_files
        apply_data install
        printf '%s\n' "$(msg done)"
        ;;
    *)
        die "unknown phase: $PHASE"
        ;;
esac
