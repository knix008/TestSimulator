#!/bin/sh
# Shell Build Script for Omni3D Studio Multi-OS Installers
set -e
echo "Starting Omni3D Studio Multi-OS Installer Build..."
node scripts/build-installers.js
echo "All installers successfully generated and placed in root directory!"
