#!/usr/bin/env bash
# Memories App — Setup Script (macOS / Linux)
# Installs all prerequisites for running the Memories application.
#
# Usage:
#   chmod +x setup.sh && ./setup.sh
#
# This script is idempotent — safe to run multiple times.

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
header(){ echo -e "\n${BOLD}$1${NC}"; }

header "Memories App — Setup"
echo "This script installs prerequisites for the Memories application."
echo ""

# --- Node.js ---
header "Checking Node.js..."
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 22 ]; then
    info "Node.js $NODE_VERSION found (>= v22 required)"
  else
    warn "Node.js $NODE_VERSION found but v22+ is required"
    echo "  Install the latest LTS from: https://nodejs.org"
    echo "  Or use nvm: nvm install --lts"
  fi
else
  error "Node.js not found"
  echo "  Install from: https://nodejs.org"
  echo "  Or use nvm:"
  echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash"
  echo "    nvm install --lts"
fi

# --- npm ---
header "Checking npm..."
if command -v npm &>/dev/null; then
  info "npm $(npm --version) found"
else
  error "npm not found (should come with Node.js)"
fi

# --- Git ---
header "Checking Git..."
if command -v git &>/dev/null; then
  info "Git $(git --version | awk '{print $3}') found"
else
  error "Git not found"
  echo "  macOS: xcode-select --install"
  echo "  Ubuntu/Debian: sudo apt-get install git"
  echo "  Fedora: sudo dnf install git"
fi

# --- GitHub Copilot CLI ---
header "Checking GitHub Copilot CLI..."
if command -v copilot &>/dev/null; then
  COPILOT_VERSION=$(copilot --version 2>/dev/null || echo "unknown")
  info "Copilot CLI found (version: $COPILOT_VERSION)"
else
  warn "Copilot CLI not found"
  echo "  Install with:"
  echo "    curl -fsSL https://gh.io/copilot-install | bash"
  echo "  Or with Homebrew:"
  echo "    brew install copilot-cli"
  echo "  Or with npm:"
  echo "    npm install -g @github/copilot"
fi

# --- Python (optional, for Python MCP server) ---
header "Checking Python (optional — needed if building MCP server in Python)..."
if command -v python3 &>/dev/null; then
  PY_VERSION=$(python3 --version | awk '{print $2}')
  PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
  PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
  if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
    info "Python $PY_VERSION found (>= 3.10 required for MCP SDK)"
  else
    warn "Python $PY_VERSION found but 3.10+ is recommended for MCP SDK"
  fi
else
  warn "Python 3 not found (only needed if building MCP server in Python)"
  echo "  Install from: https://python.org"
fi

# --- uv (optional, for Python MCP server) ---
if command -v uv &>/dev/null; then
  info "uv $(uv --version 2>/dev/null | head -1) found"
else
  warn "uv not found (optional — useful for Python MCP development)"
  echo "  Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

# --- Install app dependencies ---
header "Installing Memories app dependencies..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/src/package.json" ]; then
  cd "$SCRIPT_DIR/src"
  npm install
  info "Dependencies installed"
  cd "$SCRIPT_DIR"
else
  warn "No src/package.json found yet — run this again after the app is scaffolded"
fi

# --- Summary ---
header "Setup Complete"
echo ""
echo "Next steps:"
echo "  1. cd src && npm start     — Start the Memories app"
echo "  2. copilot                 — Launch Copilot CLI"
echo "  3. Follow docs/MCP_LAB_GUIDE.md to build your MCP server"
echo ""
