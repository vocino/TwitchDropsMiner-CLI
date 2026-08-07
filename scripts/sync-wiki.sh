#!/usr/bin/env bash
# Sync wiki/ -> vocino/TwitchDropsMiner-CLI.wiki.git (master)
# Usage: scripts/sync-wiki.sh [--dry-run] [--message "msg"]
set -euo pipefail
DRY_RUN=false
MSG="docs(wiki): sync wiki/ -> wiki.git"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --message=*) MSG="${arg#--message=}" ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WIKI_SRC="$ROOT/wiki"
TMP_WIKI="$(mktemp -d)"
trap 'rm -rf "$TMP_WIKI"' EXIT
if [ ! -d "$WIKI_SRC" ]; then
  echo "No wiki/ dir at $WIKI_SRC — nothing to sync" >&2
  exit 0
fi
echo "Cloning wiki.git..."
git clone --depth 1 "https://github.com/vocino/TwitchDropsMiner-CLI.wiki.git" "$TMP_WIKI/w" 2>&1 | head -5
if [ -n "${GITHUB_TOKEN:-}" ]; then
  git -C "$TMP_WIKI/w" remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/vocino/TwitchDropsMiner-CLI.wiki.git"
fi
echo "Syncing wiki/ -> wiki.git..."
rsync -av --delete --exclude='.git' "$WIKI_SRC"/ "$TMP_WIKI/w"/ 2>&1 | tail -20
if git -C "$TMP_WIKI/w" diff --quiet && [ -z "$(git -C "$TMP_WIKI/w" ls-files --others --exclude-standard)" ]; then
  echo "No wiki changes — skipping push."
  exit 0
fi
git -C "$TMP_WIKI/w" status --short | head -20
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] would commit: $MSG"
  git -C "$TMP_WIKI/w" diff --stat | head -20
  exit 0
fi
git -C "$TMP_WIKI/w" add -A
git -C "$TMP_WIKI/w" -c user.name="Travis Vocino" -c user.email="travis@vocino.com" commit -m "$MSG"
git -C "$TMP_WIKI/w" push origin master
echo "Wiki synced: $MSG"
