#!/usr/bin/env bash
# Build the Linux release binary, a tar.gz installer, and a .deb when dpkg-deb exists.
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$here/../.." && pwd)
version=$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$root/Cargo.toml" | head -n 1)
[ -n "$version" ] || { echo "workspace version was not found" >&2; exit 1; }

cd "$root"
cargo build --release --locked -p mydesksearch
target_dir=$(cargo metadata --format-version 1 --no-deps --offline | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p' | head -n 1)
binary=$target_dir/release/mydesksearch
[ -f "$binary" ] || { echo "release binary was not found: $binary" >&2; exit 1; }

arch=$(uname -m)
case "$arch" in
    x86_64) debarch=amd64 ;;
    aarch64|arm64) debarch=arm64 ;;
    *) debarch=$arch ;;
esac

stage=$root/dist/linux/MyDeskSearch-$version-linux-$arch
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

tarball=$root/dist/MyDeskSearch-$version-linux-$arch.tar.gz
tar -C "$stage" -czf "$tarball" .
cp -f "$tarball" "$root/$(basename "$tarball")"
echo "Tar installer: $root/$(basename "$tarball")"

if ! command -v dpkg-deb >/dev/null 2>&1; then
    echo "dpkg-deb was not found. The tar.gz installer was created."
    exit 0
fi

work=$(mktemp -d)
pkg=$work/pkg
mkdir -p "$pkg/opt/mydesksearch" "$pkg/usr/share/applications" "$pkg/usr/local/bin" "$pkg/DEBIAN"
cp "$stage/mydesksearch" "$pkg/opt/mydesksearch/mydesksearch"
cp "$stage/install.sh" "$pkg/opt/mydesksearch/install.sh"
cp "$stage/uninstall.sh" "$pkg/opt/mydesksearch/uninstall.sh"
chmod 755 "$pkg/opt/mydesksearch/mydesksearch" "$pkg/opt/mydesksearch/install.sh" "$pkg/opt/mydesksearch/uninstall.sh"
ln -s /opt/mydesksearch/mydesksearch "$pkg/usr/local/bin/mydesksearch"
cat > "$pkg/usr/share/applications/mydesksearch.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=MyDeskSearch
GenericName=File name search
Comment=Search file and folder names
Exec=/opt/mydesksearch/mydesksearch
Terminal=false
Categories=Utility;
StartupNotify=false
EOF
sed -e "s/@VERSION@/$version/" -e "s/@ARCH@/$debarch/" "$here/debian/control" > "$pkg/DEBIAN/control"
for name in preinst postinst postrm config templates; do
    cp "$here/debian/$name" "$pkg/DEBIAN/$name"
done
chmod 755 "$pkg/DEBIAN/preinst" "$pkg/DEBIAN/postinst" "$pkg/DEBIAN/postrm" "$pkg/DEBIAN/config"
deb=$root/dist/mydesksearch_${version}_${debarch}.deb
dpkg-deb --root-owner-group --build "$pkg" "$deb"
rm -rf "$work"
cp -f "$deb" "$root/$(basename "$deb")"
echo "Debian package: $root/$(basename "$deb")"
