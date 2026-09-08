#!/usr/bin/env bash
# Polls a keygen service container's /health until it responds 200 or the
# attempt budget runs out. Shared by every job that runs the keygen as a
# service container (shadownet and weeklynet shards, weeklynet-originate) —
# they all wait on the exact same thing, so this replaces three copies of the
# same inline step in main.yml.
#
# All knobs are env-driven so it doubles as a local debugging tool:
#   KEYGEN_URL=http://localhost:3000 WAIT_MAX_ATTEMPTS=30 WAIT_SLEEP_SECONDS=2 \
#     bash .github/scripts/wait-for-keygen.sh
set -euo pipefail

keygen_url="${KEYGEN_URL:-http://localhost:3000}"
keygen_url="${keygen_url%/}"
max_attempts="${WAIT_MAX_ATTEMPTS:-30}"
sleep_seconds="${WAIT_SLEEP_SECONDS:-2}"

for i in $(seq 1 "$max_attempts"); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${keygen_url}/health" || true)
  echo "attempt $i: /health -> $code"
  [ "$code" = "200" ] && exit 0
  sleep "$sleep_seconds"
done

echo "::error::keygen service did not become healthy"
exit 1
