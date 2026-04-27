#!/bin/bash
# Enhanced Screenshot - Run Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXECUTABLE="$SCRIPT_DIR/enhanced-screenshot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if executable exists
if [ ! -f "$EXECUTABLE" ]; then
    echo -e "${RED}Error: enhanced-screenshot not found!${NC}"
    echo -e "${YELLOW}Building the application...${NC}"
    
    cd "$SCRIPT_DIR"
    make
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Build failed!${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Build successful!${NC}"
fi

# Check if we're on Wayland
if [ -n "$WAYLAND_DISPLAY" ] && [ -z "$DISPLAY" ]; then
    echo -e "${YELLOW}Wayland detected. Using X11 backend for screenshot capture.${NC}"
    export GDK_BACKEND=x11
elif [ -n "$WAYLAND_DISPLAY" ]; then
    echo -e "${YELLOW}Wayland detected (XWayland running). Using X11 backend.${NC}"
    export GDK_BACKEND=x11
fi

# Display session info
if [ -n "$GDK_BACKEND" ]; then
    echo -e "${GREEN}Running with GDK_BACKEND=$GDK_BACKEND${NC}"
fi

# Run the application
echo -e "${GREEN}Starting Enhanced Screenshot...${NC}"
"$EXECUTABLE" "$@"
