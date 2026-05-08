#!/bin/bash
# Installation script for Screenshot Application

set -e

echo "Installing Screenshot Application..."

# Build if not already built
if [ ! -f "screenshot" ]; then
    echo "Building application..."
    make clean && make
fi

# Install binary
echo "Installing binary to /usr/local/bin..."
sudo install -m 755 screenshot /usr/local/bin/screenshot

# Install desktop file
echo "Installing desktop file..."
sudo install -Dm644 org.custom.Screenshot.desktop \
    /usr/share/applications/org.custom.Screenshot.desktop

# Install Polkit policy (for screenshot permissions)
echo "Installing Polkit policy..."
sudo install -Dm644 org.custom.screenshot.policy \
    /usr/share/polkit-1/actions/org.custom.screenshot.policy

# Install D-Bus service file
echo "Installing D-Bus service..."
sudo install -Dm644 org.custom.Screenshot.service \
    /usr/share/dbus-1/services/org.custom.Screenshot.service

# Configure D-Bus permissions
echo "Configuring D-Bus permissions..."
sudo tee /etc/dbus-1/system.d/org.custom.screenshot.conf > /dev/null <<EOF
<!DOCTYPEbusconfigPUBLIC
 "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <policy user="root">
    <allow own="org.custom.Screenshot"/>
  </policy>
  
  <policy context="default">
    <allow send_destination="org.gnome.Shell.Screenshot"/>
    <allow send_interface="org.gnome.Shell.Screenshot"/>
    <allow receive_sender="org.gnome.Shell.Screenshot"/>
    <allow send_destination="org.freedesktop.portal.Desktop"/>
    <allow send_interface="org.freedesktop.portal.Screenshot"/>
  </policy>
</busconfig>
EOF

# Update desktop database
echo "Updating desktop database..."
sudo update-desktop-database /usr/share/applications/ || true

# Reload D-Bus and Polkit
echo "Reloading D-Bus and Polkit..."
sudo systemctl reload dbus 2>/dev/null || true
sudo pkill -HUP polkitd 2>/dev/null || true

echo ""
echo "✓ Installation complete!"
echo ""
echo "IMPORTANT: You MUST log out and log back in for permissions to take effect."
echo ""
echo "After logging back in:"
echo "  1. Run from terminal: screenshot"
echo "  2. Launch from application menu: 'Screenshot'"
echo ""
