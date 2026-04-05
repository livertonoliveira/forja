#!/bin/bash

# Forja — Development Pipeline Framework
# Installation script: copies Forja commands into your project's .claude/commands/forja/

set -e

FORJA_REPO="https://raw.githubusercontent.com/mobitech-services/forja/main"
COMMANDS_DIR=".claude/commands/forja"
CLAUDE_MD="CLAUDE.md"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo -e "${BOLD}⚒️  Forja — Development Pipeline Framework${NC}"
echo -e "${BLUE}Automated dev pipeline: intake → develop → test → perf → security → review → PR${NC}"
echo ""

# Check if we're in a project directory
if [ ! -d ".git" ] && [ ! -f "package.json" ] && [ ! -f "go.mod" ] && [ ! -f "Cargo.toml" ] && [ ! -f "pyproject.toml" ] && [ ! -f "requirements.txt" ] && [ ! -f "Gemfile" ] && [ ! -f "composer.json" ]; then
  echo -e "${YELLOW}Warning: This doesn't look like a project root directory.${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Check if already installed
if [ -d "$COMMANDS_DIR" ]; then
  echo -e "${YELLOW}Forja is already installed in this project.${NC}"
  read -p "Overwrite existing commands? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Create commands directory
echo -e "${BLUE}Creating ${COMMANDS_DIR}/...${NC}"
mkdir -p "$COMMANDS_DIR"

# List of command files
COMMANDS=(
  "init.md"
  "dev.md"
  "intake.md"
  "develop.md"
  "test.md"
  "perf.md"
  "security.md"
  "review.md"
  "homolog.md"
  "pr.md"
)

# Download commands
echo -e "${BLUE}Downloading Forja commands...${NC}"
for cmd in "${COMMANDS[@]}"; do
  echo -e "  Fetching ${cmd}..."
  curl -sL "${FORJA_REPO}/commands/forja/${cmd}" -o "${COMMANDS_DIR}/${cmd}"
done

# Append Forja section to CLAUDE.md if not already present
if [ -f "$CLAUDE_MD" ]; then
  if ! grep -q "Forja" "$CLAUDE_MD" 2>/dev/null; then
    echo -e "${BLUE}Adding Forja section to existing CLAUDE.md...${NC}"
    echo "" >> "$CLAUDE_MD"
    curl -sL "${FORJA_REPO}/CLAUDE.forja.md" >> "$CLAUDE_MD"
  else
    echo -e "${YELLOW}CLAUDE.md already contains Forja configuration. Skipping.${NC}"
  fi
else
  echo -e "${BLUE}Creating CLAUDE.md with Forja configuration...${NC}"
  curl -sL "${FORJA_REPO}/CLAUDE.forja.md" -o "$CLAUDE_MD"
fi

echo ""
echo -e "${GREEN}${BOLD}Forja installed successfully!${NC}"
echo ""
echo -e "Available commands:"
echo -e "  ${BOLD}/forja:init${NC}      — Initialize Forja (detect stack, create config)"
echo -e "  ${BOLD}/forja:dev${NC}       — Full pipeline (intake → homologation)"
echo -e "  ${BOLD}/forja:intake${NC}    — Extract requirements"
echo -e "  ${BOLD}/forja:develop${NC}   — Implement code"
echo -e "  ${BOLD}/forja:test${NC}      — Generate & run tests"
echo -e "  ${BOLD}/forja:perf${NC}      — Performance analysis"
echo -e "  ${BOLD}/forja:security${NC}  — Security scan"
echo -e "  ${BOLD}/forja:review${NC}    — Code review"
echo -e "  ${BOLD}/forja:homolog${NC}   — User homologation"
echo -e "  ${BOLD}/forja:pr${NC}        — Create pull request"
echo ""
echo -e "${BLUE}Next step:${NC} Run ${BOLD}/forja:init${NC} in Claude Code to configure your project."
echo ""
