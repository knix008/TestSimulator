#!/bin/bash
# Uninstallation script for Enhanced Screenshot

set -e

echo "Uninstalling Enhanced Screenshot..."

# Remove binary
if [ -f "/usr/local/bin/screenshot" ]; then
    echo "Removing binary..."
    sudo rm -f /usr/local/bin/screenshot
fi

# Remove desktop file
if [ -f "/usr/share/applications/org.custom.Screenshot.desktop" ]; then
    echo "Removing desktop file..."
    sudo rm -f /usr/share/applications/org.custom.Screenshot.desktop
fi

# Remove D-Bus policy
if [ -f "/usr/share/dbus-1/system.d/org.custom.EnhancedScreenshot.conf" ]; then
    echo "Removing D-Bus policy..."
    sudo rm -f /usr/share/dbus-1/system.d/org.custom.EnhancedScreenshot.conf
fi

# Update desktop database
echo "Updating desktop database..."
sudo update-desktop-database /usr/share/applications/ || true

echo ""
echo "✓ Uninstallation complete!"
