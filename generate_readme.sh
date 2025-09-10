#!/usr/bin/env bash

set -euo pipefail

# Ensure required tools exist (macOS-friendly checks)
for cmd in npx jq gomplate; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' is required but not installed." >&2
    case "$cmd" in
      jq)
        echo "Install jq on macOS: brew install jq" >&2
        ;;
      gomplate)
        echo "Install gomplate on macOS: brew install gomplate" >&2
        ;;
      npx)
        echo "Install Node.js (which provides npx): brew install node" >&2
        ;;
    esac
    exit 1
  fi
done

# Recreate presets directory and generated examples
mkdir -p assets/presets
rm -rf assets/presets/*

npx tsx src/presets/renderExamples.ts

# Build JSON array of filenames in assets/presets/
# Use ls -1 for predictable, one-per-line output compatible with macOS 'ls'
presets=$(ls -1 assets/presets/ 2>/dev/null | jq -R . | jq -s .)
export presets

# Render README via gomplate using the JSON list
gomplate -f README.md.tmpl -d presets=env:///presets?type=application/json > README.md
