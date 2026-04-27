#!/usr/bin/env bash
set -euo pipefail

BUMP_TYPE="${1:-}"
if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: $0 <patch|minor|major>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION_FILE="$ROOT_DIR/VERSION"
CHANGELOG_FILE="$ROOT_DIR/CHANGELOG.md"

CURRENT_VERSION="$(cat "$VERSION_FILE")"
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
  minor) NEW_VERSION="$MAJOR.$((MINOR + 1)).0" ;;
  patch) NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
esac

echo "$NEW_VERSION" > "$VERSION_FILE"
npm -C "$ROOT_DIR" version "$NEW_VERSION" --no-git-tag-version --allow-same-version > /dev/null

DATE="$(date +%Y-%m-%d)"
NEW_ENTRY="## [$NEW_VERSION] — $DATE"

FIRST_ENTRY_LINE="$(grep -n '^## \[' "$CHANGELOG_FILE" | head -1 | cut -d: -f1)"

if [[ -n "$FIRST_ENTRY_LINE" ]]; then
  HEAD_LINES=$((FIRST_ENTRY_LINE - 1))
  HEAD_CONTENT="$(head -n "$HEAD_LINES" "$CHANGELOG_FILE")"
  TAIL_CONTENT="$(tail -n +"$FIRST_ENTRY_LINE" "$CHANGELOG_FILE")"
  printf '%s\n%s\n\n%s\n' "$HEAD_CONTENT" "$NEW_ENTRY" "$TAIL_CONTENT" > "$CHANGELOG_FILE"
else
  printf '%s\n\n' "$NEW_ENTRY" >> "$CHANGELOG_FILE"
fi

git -C "$ROOT_DIR" tag "$NEW_VERSION"

echo "Bumped $CURRENT_VERSION → $NEW_VERSION"
