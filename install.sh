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
mkdir -p "$COMMANDS_DIR/audit"

# List of command files
COMMANDS=(
  "init.md"
  "spec.md"
  "run.md"
  "develop.md"
  "test.md"
  "perf.md"
  "security.md"
  "review.md"
  "homolog.md"
  "pr.md"
)

AUDIT_COMMANDS=(
  "backend.md"
  "frontend.md"
  "database.md"
  "security.md"
  "run.md"
)

# Download commands
echo -e "${BLUE}Downloading Forja pipeline commands...${NC}"
for cmd in "${COMMANDS[@]}"; do
  echo -e "  Fetching ${cmd}..."
  curl -sL "${FORJA_REPO}/commands/forja/${cmd}" -o "${COMMANDS_DIR}/${cmd}"
done

# Download audit commands
echo -e "${BLUE}Downloading Forja audit commands...${NC}"
for cmd in "${AUDIT_COMMANDS[@]}"; do
  echo -e "  Fetching audit/${cmd}..."
  curl -sL "${FORJA_REPO}/commands/forja/audit/${cmd}" -o "${COMMANDS_DIR}/audit/${cmd}"
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
echo -e "Pipeline commands:"
echo -e "  ${BOLD}/forja:init${NC}              — Initialize Forja (detect stack, create config)"
echo -e "  ${BOLD}/forja:spec${NC}              — Specify feature, decompose into tasks"
echo -e "  ${BOLD}/forja:run${NC}               — Full pipeline for a task (develop → homologation)"
echo -e "  ${BOLD}/forja:develop${NC}           — Implement code"
echo -e "  ${BOLD}/forja:test${NC}              — Generate & run tests"
echo -e "  ${BOLD}/forja:perf${NC}              — Performance analysis (diff)"
echo -e "  ${BOLD}/forja:security${NC}          — Security scan (diff)"
echo -e "  ${BOLD}/forja:review${NC}            — Code review"
echo -e "  ${BOLD}/forja:homolog${NC}           — User homologation"
echo -e "  ${BOLD}/forja:pr${NC}               — Create pull request"
echo ""
echo -e "Audit commands (project-wide):"
echo -e "  ${BOLD}/forja:audit:run${NC}         — Run all applicable audits in parallel"
echo -e "  ${BOLD}/forja:audit:backend${NC}     — Full backend performance audit"
echo -e "  ${BOLD}/forja:audit:frontend${NC}    — Full frontend performance audit"
echo -e "  ${BOLD}/forja:audit:database${NC}    — Full database audit (MongoDB/PostgreSQL/MySQL)"
echo -e "  ${BOLD}/forja:audit:security${NC}    — Full AppSec audit (OWASP Top 10)"
echo ""
echo -e "${BLUE}Next step:${NC} Run ${BOLD}/forja:init${NC} in Claude Code to configure your project."
echo ""
