#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Clover needs Node.js 22 or newer: https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Clover needs Node.js 22 or newer."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparing Clover for its first launch…"
  npm ci --no-audit --no-fund
fi

LOCAL_URL="http://localhost:3477"
(
  sleep 5
  if command -v open >/dev/null 2>&1; then open "$LOCAL_URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$LOCAL_URL"
  fi
) >/dev/null 2>&1 &

echo "Clover is opening at $LOCAL_URL"
echo "Keep this terminal open while you use Clover. Press Ctrl+C to stop."
npm run device
