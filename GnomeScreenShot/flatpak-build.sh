#!/bin/bash
# Flatpak build and installation script

set -e

echo "=================================="
echo "  Flatpak Screenshot Builder"
echo "=================================="
echo ""

# Check if flatpak is installed
if ! command -v flatpak &> /dev/null; then
    echo "ERROR: flatpak is not installed"
    echo "Install it with: sudo apt install flatpak"
    exit 1
fi

# Check if flatpak-builder is installed
if ! command -v flatpak-builder &> /dev/null; then
    echo "ERROR: flatpak-builder is not installed"
    echo "Install it with: sudo apt install flatpak-builder"
    exit 1
fi

# Check if GNOME runtime is installed
echo "Checking GNOME runtime..."
if ! flatpak list --runtime | grep -q "org.gnome.Platform.*47"; then
    echo "Installing GNOME runtime 47..."
    flatpak install -y flathub org.gnome.Platform//47 org.gnome.Sdk//47
fi

# Clean previous build
echo ""
echo "Cleaning previous build..."
rm -rf flatpak-build flatpak-repo

# Build the flatpak
echo ""
echo "Building Flatpak..."
flatpak-builder --force-clean --install-deps-from=flathub \
    flatpak-build org.custom.Screenshot.json

# Export to repository
echo ""
echo "Exporting to repository..."
flatpak-builder --repo=flatpak-repo --force-clean \
    flatpak-build org.custom.Screenshot.json

# Install locally
echo ""
echo "Installing Flatpak..."
flatpak-builder --user --install --force-clean \
    flatpak-build org.custom.Screenshot.json

echo ""
echo "=================================="
echo "  ✓ Build Complete!"
echo "=================================="
echo ""
echo "Run the application:"
echo "  flatpak run org.custom.Screenshot"
echo ""
echo "Or launch from your application menu: 'Screenshot'"
echo ""
