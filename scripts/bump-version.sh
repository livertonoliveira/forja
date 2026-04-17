#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION_FILE="$ROOT_DIR/VERSION"
CHANGELOG_FILE="$ROOT_DIR/CHANGELOG.md"

BUMP_TYPE="${1:-}"

if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
  echo "Usage: $0 major|minor|patch" >&2
  exit 1
fi

CURRENT_VERSION="$(cat "$VERSION_FILE")"

if [[ ! "$CURRENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: VERSION file contains invalid semver: $CURRENT_VERSION" >&2
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TODAY="$(date +%Y-%m-%d)"

echo "$NEW_VERSION" > "$VERSION_FILE"

FIRST_ENTRY_LINE=$(grep -n "^## \[" "$CHANGELOG_FILE" | head -1 | cut -d: -f1)
TEMP=$(mktemp)
{
  head -n $((FIRST_ENTRY_LINE - 1)) "$CHANGELOG_FILE"
  echo "## [$NEW_VERSION] — $TODAY"
  echo "### Adicionado"
  echo "-"
  echo ""
  tail -n "+$FIRST_ENTRY_LINE" "$CHANGELOG_FILE"
} > "$TEMP"
mv "$TEMP" "$CHANGELOG_FILE"

git -C "$ROOT_DIR" tag "v$NEW_VERSION"

echo "Bumped para $NEW_VERSION"
