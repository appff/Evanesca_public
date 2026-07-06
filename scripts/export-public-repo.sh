#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-"$(cd "$ROOT/.." && pwd)/Evanesca-public"}"
REMOTE_URL="${EVANESCA_PUBLIC_REMOTE:-git@github.com:appff/Evanesca_public.git}"
MARKER=".evanesca-public-export"

if [[ -e "$TARGET" && ! -f "$TARGET/$MARKER" ]]; then
  echo "Refusing to overwrite existing directory without $MARKER: $TARGET" >&2
  exit 1
fi

mkdir -p "$TARGET"
touch "$TARGET/$MARKER"

copy_file() {
  local src="$1"
  if [[ -f "$ROOT/$src" ]]; then
    mkdir -p "$TARGET/$(dirname "$src")"
    rsync -a "$ROOT/$src" "$TARGET/$src"
  fi
}

copy_dir() {
  local src="$1"
  if [[ -d "$ROOT/$src" ]]; then
    mkdir -p "$TARGET/$src"
    rsync -a --delete \
      --exclude '.DS_Store' \
      --exclude '.claude/' \
      --exclude '.playwright-mcp/' \
      "$ROOT/$src/" "$TARGET/$src/"
  fi
}

copy_file ".env.example"
copy_file ".gitignore"
copy_file "CITATION.cff"
copy_file "CONTRIBUTING.md"
copy_file "LICENSE"
copy_file "README.md"
copy_file "SECURITY.md"
copy_file "package-lock.json"
copy_file "package.json"
copy_file "tsconfig.json"

copy_dir ".github"
copy_dir "src"
copy_dir "scripts"

copy_dir "artifacts/defect-hashes-public"
copy_dir "artifacts/non-baseline-hashes"

copy_dir "docs/technical-report"

rm -rf \
  "$TARGET/node_modules" \
  "$TARGET/.env" \
  "$TARGET/docs/papers/evanesca" \
  "$TARGET/artifacts/defect-hashes-internal"

if [[ ! -d "$TARGET/.git" ]]; then
  git -C "$TARGET" init
fi

if git -C "$TARGET" remote get-url origin >/dev/null 2>&1; then
  git -C "$TARGET" remote set-url origin "$REMOTE_URL"
else
  git -C "$TARGET" remote add origin "$REMOTE_URL"
fi

echo "Exported Evanesca public repository to $TARGET"
echo "Configured origin: $REMOTE_URL"
