#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "FREE CRM needs Node.js 22.13.0 or newer: https://nodejs.org/"
  exit 1
fi

if ! node -e "const [major,minor]=process.versions.node.split('.').map(Number); process.exit(major>22 || (major===22 && minor>=13) ? 0 : 1)"; then
  echo "FREE CRM needs Node.js 22.13.0 or newer; this device has $(node -p 'process.versions.node')."
  exit 1
fi

EXPECTED_STAMP=$(node -e "const fs=require('node:fs'),crypto=require('node:crypto'); const hash=crypto.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'); process.stdout.write([process.versions.node,process.platform,process.arch,hash].join('|'))")
INSTALLED_STAMP=''
if [ -f node_modules/.free-crm-install-stamp ]; then INSTALLED_STAMP=$(tr -d '\r\n' < node_modules/.free-crm-install-stamp); fi
if [ "$INSTALLED_STAMP" != "$EXPECTED_STAMP" ]; then
  echo "Synchronizing FREE CRM dependencies with this device and lockfile…"
  npm ci --no-audit --no-fund
  printf '%s\n' "$EXPECTED_STAMP" > node_modules/.free-crm-install-stamp
fi

LOCAL_URL="http://127.0.0.1:3477"
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
