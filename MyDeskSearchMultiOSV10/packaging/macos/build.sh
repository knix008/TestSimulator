#!/usr/bin/env bash
# Build the macOS release binary, a tar.gz installer, and a .pkg when pkgbuild exists.
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$here/../.." && pwd)
version=$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$root/Cargo.toml" | head -n 1)
[ -n "$version" ] || { echo "workspace version was not found" >&2; exit 1; }
case "$(uname -s)" in
    Darwin) ;;
    *) echo "Run this script on macOS." >&2; exit 1 ;;
esac

cd "$root"
cargo build --release --locked -p mydesksearch
target_dir=$(cargo metadata --format-version 1 --no-deps --offline | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p' | head -n 1)
binary=$target_dir/release/mydesksearch
[ -f "$binary" ] || { echo "release binary was not found: $binary" >&2; exit 1; }

arch=$(uname -m)
stage=$root/dist/macos/MyDeskSearch-$version-macos-$arch
rm -rf "$stage"
mkdir -p "$stage" "$root/dist"
cp "$binary" "$stage/mydesksearch"
chmod 755 "$stage/mydesksearch"
cp "$here/../unix/install.sh" "$stage/install.sh"
chmod 755 "$stage/install.sh"
cat > "$stage/uninstall.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec bash "$here/install.sh" --uninstall "$@"
EOF
chmod 755 "$stage/uninstall.sh"
printf '%s\n' "$version" > "$stage/version.txt"

tarball=$root/dist/MyDeskSearch-$version-macos-$arch.tar.gz
tar -C "$stage" -czf "$tarball" .
cp -f "$tarball" "$root/$(basename "$tarball")"
echo "Tar installer: $root/$(basename "$tarball")"

if ! command -v pkgbuild >/dev/null 2>&1; then
    echo "pkgbuild was not found. The tar.gz installer was created."
    exit 0
fi

app=$stage/MyDeskSearch.app
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$stage/mydesksearch" "$app/Contents/MacOS/mydesksearch"
chmod 755 "$app/Contents/MacOS/mydesksearch"
cp "$stage/install.sh" "$app/Contents/Resources/install.sh"
cp "$stage/uninstall.sh" "$app/Contents/Resources/uninstall.sh"
chmod 755 "$app/Contents/Resources/install.sh" "$app/Contents/Resources/uninstall.sh"
sed -e "s/@VERSION@/$version/g" "$here/Info.plist" > "$app/Contents/Info.plist"

payload=$(mktemp -d)
scripts=$(mktemp -d)
mkdir -p "$payload/Applications"
cp -R "$app" "$payload/Applications/MyDeskSearch.app"
cp "$here/scripts/preinstall" "$here/scripts/postinstall" "$stage/install.sh" "$scripts/"
chmod 755 "$scripts/preinstall" "$scripts/postinstall" "$scripts/install.sh"
pkg=$root/dist/MyDeskSearch-$version-macos-$arch.pkg
root_pkg=$root/$(basename "$pkg")
pkgbuild \
    --identifier com.mydesksearch.app \
    --version "$version" \
    --root "$payload" \
    --install-location / \
    --scripts "$scripts" \
    "$pkg"
rm -rf "$payload" "$scripts"
cp -f "$pkg" "$root_pkg"
echo "Package installer: $root_pkg"
