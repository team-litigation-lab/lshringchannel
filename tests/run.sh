#!/usr/bin/env bash
# Runs the end-to-end tests against a local wrangler dev server with a stand-in for Google's Gemini API.
#   cd tests && npm install && npx playwright install chromium && npm test
# Set CHROME_PATH to use a Chrome you already have, SHOTS=<folder> to keep the screenshots,
# LIVE_ONLY=1 to run only the live-call test.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
PORT=${PORT:-8799}
STATE=$(mktemp -d)
cleanup() { kill "${WR:-}" "${MOCK:-}" 2>/dev/null || true; rm -rf "$STATE"; }
trap cleanup EXIT
node mock-gemini.js > "$STATE/mock.log" 2>&1 & MOCK=$!
cat > "$STATE/.dev.vars" <<VARS
ADMIN_PASSPHRASE=test-pass
GEMINI_API_KEY5=fake-key-5
GEMINI_API_KEY6=fake-key-6
GEMINI_BASE=http://127.0.0.1:9911
LIVE_WS_URL=ws://127.0.0.1:9911/live
VARS
(cd "$ROOT" && NO_PROXY=127.0.0.1,localhost npx wrangler dev --port "$PORT" --ip 127.0.0.1 --persist-to "$STATE/data" --env-file "$STATE/.dev.vars" > "$STATE/wrangler.log" 2>&1) & WR=$!
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/" > /dev/null && break; sleep 1; done
export BASE="http://127.0.0.1:$PORT" OUT="${SHOTS:-$STATE}"
node e2e-live.js
if [ -z "${LIVE_ONLY:-}" ]; then node e2e-ai.js; fi
