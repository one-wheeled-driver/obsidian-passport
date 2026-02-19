#!/usr/bin/env bash
# Install obs2pdf plugin into the Obsidian vault.
#
# Layout:  obs2pdf/plugin/install.sh  (this file)
#          obs2pdf/                    (project root — obs2pdf.py, numbered-title.csl)
#          .obsidian/                  (vault root, two levels up)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VAULT_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"
DEST="$VAULT_ROOT/.obsidian/plugins/obs2pdf"

if [ ! -d "$VAULT_ROOT/.obsidian" ]; then
  echo "Error: .obsidian/ not found at $VAULT_ROOT" >&2
  echo "Run this script from inside a vault's obs2pdf/plugin/ directory." >&2
  exit 1
fi

mkdir -p "$DEST"

cp "$SCRIPT_DIR/main.js"            "$DEST/main.js"
cp "$SCRIPT_DIR/manifest.json"      "$DEST/manifest.json"
cp "$PROJECT_ROOT/obs2pdf.py"       "$DEST/obs2pdf.py"
cp "$PROJECT_ROOT/numbered-title.csl" "$DEST/numbered-title.csl"

echo "Installed to $DEST"
ls -l "$DEST"
