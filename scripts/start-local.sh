#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "FREE CRM needs Node.js 22 or newer: https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "FREE CRM needs Node.js 22 or newer."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparing FREE CRM for its first launch…"
  npm ci --no-audit --no-fund
fi

LOCAL_URL="http://localhost:3477"
(
  ATTEMPT=0
  while [ "$ATTEMPT" -lt 180 ]; do
    if node -e "fetch('$LOCAL_URL').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
      if command -v open >/dev/null 2>&1; then open "$LOCAL_URL"
      elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$LOCAL_URL"
      fi
      exit 0
    fi
    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
  done
) >/dev/null 2>&1 &

echo "FREE CRM is preparing and will open at $LOCAL_URL"
echo "Keep this terminal open while you use FREE CRM. Press Ctrl+C to stop."
npm run device
