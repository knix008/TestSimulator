#!/bin/bash
# Enhanced Screenshot - Debug Run Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXECUTABLE="$SCRIPT_DIR/enhanced-screenshot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===== Enhanced Screenshot Debug Mode =====${NC}"
echo ""

# System information
echo -e "${BLUE}System Information:${NC}"
echo "OS: $(uname -s)"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"
echo ""

# Display server information
echo -e "${BLUE}Display Server:${NC}"
if [ -n "$WAYLAND_DISPLAY" ]; then
    echo "Wayland Display: $WAYLAND_DISPLAY"
fi
if [ -n "$DISPLAY" ]; then
    echo "X11 Display: $DISPLAY"
fi
echo ""

# GTK information
echo -e "${BLUE}GTK Version:${NC}"
pkg-config --modversion gtk+-3.0 2>/dev/null || echo "GTK+ 3.0 not found"
echo ""

# Check if executable exists
if [ ! -f "$EXECUTABLE" ]; then
    echo -e "${RED}Error: enhanced-screenshot not found!${NC}"
    echo -e "${YELLOW}Building with debug symbols...${NC}"
    
    cd "$SCRIPT_DIR"
    make clean && make
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Build failed!${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Build successful!${NC}"
    echo ""
fi

# Force X11 backend
export GDK_BACKEND=x11
export G_MESSAGES_DEBUG=all

echo -e "${BLUE}Environment:${NC}"
echo "GDK_BACKEND=$GDK_BACKEND"
echo "G_MESSAGES_DEBUG=$G_MESSAGES_DEBUG"
echo ""

# Run with debug output
echo -e "${GREEN}Starting Enhanced Screenshot in debug mode...${NC}"
echo -e "${YELLOW}(All debug messages will be displayed)${NC}"
echo ""
echo -e "${BLUE}===========================================${NC}"
echo ""

"$EXECUTABLE" "$@" 2>&1 | tee screenshot-debug.log

echo ""
echo -e "${BLUE}===========================================${NC}"
echo -e "${GREEN}Debug log saved to: screenshot-debug.log${NC}"
