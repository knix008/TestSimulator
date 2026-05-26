#!/usr/bin/env bash
# Install all dependencies for MIDIMaster GTK V10.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNAME="$(uname -s)"

install_music21() {
    if python3 -c "import music21" 2>/dev/null; then
        echo "    music21 already installed"
        return 0
    fi
    echo "    Installing music21 via pip ..."
    if pip3 install --user --break-system-packages music21 2>/dev/null; then
        return 0
    fi
    if pip3 install --user music21 2>/dev/null; then
        return 0
    fi
    if python3 -m pip install --user music21 2>/dev/null; then
        return 0
    fi
    echo "    [!] pip install music21 failed — run manually: pip3 install --user music21"
    return 1
}

update_pixbuf_cache() {
    local q=""
    if command -v gdk-pixbuf-query-loaders >/dev/null 2>&1; then
        q="$(command -v gdk-pixbuf-query-loaders)"
    elif [ -x /usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders ]; then
        q="/usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders"
    fi
    if [ -n "$q" ]; then
        echo "    Updating GdkPixbuf loader cache ..."
        sudo "$q" --update-cache 2>/dev/null || "$q" --update-cache 2>/dev/null || true
    fi
}

echo "==> Installing dependencies ($UNAME)..."

case "$UNAME" in
Linux)
    if command -v apt-get >/dev/null; then
        echo "    using: apt-get"
        sudo apt-get update
        sudo apt-get install -y \
            build-essential pkg-config git cmake g++ \
            python3 python3-pip python3-venv \
            libgtk-3-dev libgdk-pixbuf2.0-dev \
            libfluidsynth-dev libsndfile1-dev \
            libglib2.0-dev libcairo2-dev \
            librsvg2-common librsvg2-dev \
            libpango1.0-dev libxml2-dev \
            libcurl4-openssl-dev libssl-dev \
            libmp3lame-dev
    elif command -v dnf >/dev/null; then
        echo "    using: dnf"
        sudo dnf install -y \
            gcc gcc-c++ make pkg-config git cmake \
            python3 python3-pip \
            gtk3-devel gdk-pixbuf2-devel \
            fluidsynth-devel libsndfile-devel \
            glib2-devel cairo-devel \
            librsvg2-devel librsvg2 \
            pango-devel libxml2-devel \
            libcurl-devel openssl-devel \
            lame-devel
    elif command -v pacman >/dev/null; then
        echo "    using: pacman"
        sudo pacman -S --needed --noconfirm \
            base-devel pkg-config git cmake \
            python python-pip \
            gtk3 gdk-pixbuf2 \
            fluidsynth libsndfile \
            glib2 cairo librsvg \
            pango libxml2 curl openssl \
            lame
    else
        echo "    !! Unsupported package manager. Install manually (see README.md)."
        exit 1
    fi
    update_pixbuf_cache
    install_music21 || true
    ;;

Darwin)
    if ! command -v brew >/dev/null; then
        echo "    !! Homebrew required: https://brew.sh/"
        exit 1
    fi
    echo "    using: Homebrew"
    brew install \
        pkg-config git cmake python \
        gtk+3 gdk-pixbuf \
        fluid-synth libsndfile \
        librsvg cairo pango libxml2 \
        lame openssl curl
    install_music21 || true
    ;;

*)
    echo "    !! Unsupported OS: $UNAME"
    exit 1
    ;;
esac

echo ""
echo "==> Verifying installation ..."
bash "$ROOT/scripts/check-deps.sh"
