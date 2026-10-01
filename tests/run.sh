#!/usr/bin/env bash
# Runs the end-to-end tests against a local wrangler dev server with a stand-in for Google's Gemini API.
#   cd tests && npm install && npx playwright install chromium && npm test
# Set CHROME_PATH to use a Chrome you already have, SHOTS=<folder> to keep the screenshots,
# LIVE_ONLY=1 to run only the live-call test.
# Also runs the server request meter's tests: e2e-meter.js (this site) and request-meter-widget.cjs (the meter
# itself, the same test in every LSH platform).
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
PORT=${PORT:-8799}
STATE=$(mktemp -d)
# wrangler dev runs under npx in a subshell: stop the whole tree, or an old server keeps the port for the next run.
killtree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do killtree "$c"; done; kill "$1" 2>/dev/null || true; }
cleanup() { [ -n "${WR:-}" ] && killtree "$WR"; kill "${MOCK:-}" 2>/dev/null || true; rm -rf "$STATE"; }
trap cleanup EXIT
node mock-gemini.js > "$STATE/mock.log" 2>&1 & MOCK=$!
cat > "$STATE/.dev.vars" <<VARS
ADMIN_PASSPHRASE=test-pass
GEMINI_API_KEY5=fake-key-5
GEMINI_API_KEY6=fake-key-6
GEMINI_BASE=http://127.0.0.1:9911
LIVE_WS_URL=ws://127.0.0.1:9911/live
VARS
if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then echo "Port $PORT is already in use: stop that server or set PORT=<another port>."; exit 1; fi
(cd "$ROOT" && NO_PROXY=127.0.0.1,localhost npx wrangler dev --port "$PORT" --ip 127.0.0.1 --persist-to "$STATE/data" --env-file "$STATE/.dev.vars" > "$STATE/wrangler.log" 2>&1) & WR=$!
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/" > /dev/null && break; sleep 1; done
export BASE="http://127.0.0.1:$PORT" OUT="${SHOTS:-$STATE}" PERSIST="$STATE/data"
node e2e-live.js
if [ -z "${LIVE_ONLY:-}" ]; then
  node e2e-ai.js
  node e2e-meter.js
  CHROMIUM_PATH="${CHROMIUM_PATH:-${CHROME_PATH:-}}" node request-meter-widget.cjs ../public/js/request-budget.js
fi
