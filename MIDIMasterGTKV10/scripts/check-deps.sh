#!/usr/bin/env bash
# Verify all dependencies for MIDIMaster GTK V10.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

missing=""
warn=""

add_missing() { missing="$missing $1"; }
add_warn()    { warn="$warn $1"; }

echo "==> Checking dependencies ($(uname -s))..."

# --- Build tools ---
for cmd in gcc g++ make pkg-config git cmake python3; do
    if command -v "$cmd" >/dev/null 2>&1; then
        echo "  [O] $cmd        $(command -v "$cmd")"
    else
        echo "  [X] $cmd"
        add_missing "$cmd"
    fi
done

# --- pkg-config libraries (link midimaster) ---
for pkg in gtk+-3.0 gdk-pixbuf-2.0 librsvg-2.0 fluidsynth sndfile glib-2.0 cairo pangocairo; do
    if pkg-config --exists "$pkg" 2>/dev/null; then
        echo "  [O] $pkg  $(pkg-config --modversion "$pkg")"
    else
        echo "  [X] $pkg"
        add_missing "$pkg"
    fi
done

# --- MP3 export (optional) ---
if pkg-config --exists lame 2>/dev/null || ldconfig -p 2>/dev/null | grep -q libmp3lame; then
    echo "  [O] lame        (MP3 export)"
else
    echo "  [!] lame        missing (MP3 export disabled)"
    add_warn "libmp3lame-dev"
fi

# --- SVG loader for score (GdkPixbuf → librsvg) ---
svg_loader_ok=0
pixbuf_query=""
if command -v gdk-pixbuf-query-loaders >/dev/null 2>&1; then
    pixbuf_query="$(command -v gdk-pixbuf-query-loaders)"
elif [ -x /usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders ]; then
    pixbuf_query="/usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders"
fi
if [ -n "$pixbuf_query" ] && "$pixbuf_query" 2>/dev/null | grep -q 'libpixbufloader-svg'; then
    svg_loader_ok=1
fi
if [ "$svg_loader_ok" -eq 0 ]; then
  for loader in /usr/lib/*/gdk-pixbuf-2.0/*/loaders/libpixbufloader-svg.so \
                /usr/lib/gdk-pixbuf-2.0/*/loaders/libpixbufloader-svg.so; do
    if [ -f "$loader" ]; then
      svg_loader_ok=1
      break
    fi
  done
fi
if [ "$svg_loader_ok" -eq 1 ]; then
    echo "  [O] SVG loader  libpixbufloader-svg (GdkPixbuf)"
else
    echo "  [X] SVG loader  librsvg2-common (required for score fonts)"
    add_missing "librsvg2-common"
fi

# --- Python music21 (MIDI → MusicXML) ---
if python3 -c "import music21" 2>/dev/null; then
    ver="$(python3 -c "import music21; print(music21.__version__)" 2>/dev/null || echo "?")"
    echo "  [O] music21     $ver"
else
    echo "  [X] music21     (pip install music21)"
    add_missing "python3-music21"
fi

# --- SoundFont ---
if [ -f "$ROOT/SoundFonts/TimGM6mb.sf2" ]; then
    echo "  [O] SoundFont   SoundFonts/TimGM6mb.sf2"
else
    sf_src="$ROOT/../MIDIMasterWinV10/MIDIMasterWinV10/SoundFonts/TimGM6mb.sf2"
    if [ -f "$sf_src" ]; then
        echo "  [!] SoundFont   will copy on build from MIDIMasterWinV10"
    else
        echo "  [X] SoundFont   TimGM6mb.sf2 missing"
        add_missing "TimGM6mb.sf2"
    fi
fi

if [ -n "$warn" ]; then
    echo ""
    echo "  [!] Optional / warnings:$warn"
fi

if [ -n "$missing" ]; then
    echo ""
    echo "  [X] Missing required dependencies:$missing"
    echo "      Run: make install-deps"
    exit 1
fi

echo ""
echo "==> All required dependencies satisfied."
exit 0
