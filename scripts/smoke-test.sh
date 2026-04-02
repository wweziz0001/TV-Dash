#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:4000/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@tvdash.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
TEST_STREAM_URL="${TEST_STREAM_URL:-https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8}"

echo "Checking API health at ${API_BASE_URL}..."
curl -fsS "${API_BASE_URL}/health" >/tmp/tv_dash_health.json
cat /tmp/tv_dash_health.json
echo

echo "Authenticating seeded admin user..."
TOKEN="$(
  curl -fsS \
    -X POST "${API_BASE_URL}/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).token'
)"

echo "Listing channels..."
curl -fsS "${API_BASE_URL}/channels" -H "authorization: Bearer ${TOKEN}" >/tmp/tv_dash_channels.json
node -e 'const data = JSON.parse(require("fs").readFileSync("/tmp/tv_dash_channels.json", "utf8")); console.log(`channels=${data.channels.length}`);'

echo "Testing HLS master playlist metadata..."
curl -fsS \
  -X POST "${API_BASE_URL}/streams/test" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${TOKEN}" \
  -d "{\"url\":\"${TEST_STREAM_URL}\"}" >/tmp/tv_dash_stream_test.json
cat /tmp/tv_dash_stream_test.json
echo

echo "Smoke test completed successfully."
