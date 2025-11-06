#!/bin/bash

# Cloudflare Tunnel Setup for Farcaster Mini App Testing
# This script automatically starts a cloudflare tunnel for local development

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚇 Starting Cloudflare Tunnel for Farcaster Testing${NC}"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared is not installed${NC}"
    echo ""
    echo -e "${YELLOW}To install cloudflared:${NC}"
    echo ""
    echo "macOS (Homebrew):"
    echo "  brew install cloudflare/cloudflare/cloudflared"
    echo ""
    echo "macOS (Direct):"
    echo "  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz | tar -xz"
    echo "  sudo mv cloudflared /usr/local/bin"
    echo ""
    echo "Linux:"
    echo "  wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    echo "  chmod +x cloudflared-linux-amd64"
    echo "  sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared"
    echo ""
    echo "Windows:"
    echo "  Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    echo ""
    exit 1
fi

# Check if local server is running
PORT=${PORT:-5005}
if ! lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠️  Local server not detected on port $PORT${NC}"
    echo -e "${YELLOW}Make sure to run 'npm run dev' in another terminal first${NC}"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}✓ cloudflared is installed${NC}"
echo -e "${GREEN}✓ Starting tunnel to localhost:$PORT${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Tunnel is starting...${NC}"
echo -e "${BLUE}  Look for the public URL below (https://xxx.trycloudflare.com)${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Start cloudflare tunnel
# This will output the public URL and keep running
cloudflared tunnel --url http://localhost:$PORT


