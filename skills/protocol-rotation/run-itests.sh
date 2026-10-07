#!/usr/bin/env bash
# Run the integration suite on one lane in resumable chunks.
#
# One secret-key signer makes the full suite slower than a single tool timeout (it took
# >55 min), so run it in rounds: each round runs only the spec files that have not yet
# reported a result, under `timeout`. Failed files are re-run once, alone (parallel files
# sharing one signer can collide on the counter / mempool and pass in isolation).
#
# Usage (key via env, never written to disk):
#   SECRET_KEY='edsk...' skills/protocol-rotation/run-itests.sh <lane> [round-timeout-sec] [out-dir]
#   e.g. ... run-itests.sh ushuaianet 3000 "$SCRATCH/itests"
#
# Needs `test:<lane>-secret-key` in integration-tests/package.json. flextesa/ and ledger/
# specs are excluded (sandbox / hardware). Exit status: 0 only if nothing failed after retry.
set -uo pipefail
lane=${1:?lane, e.g. ushuaianet}
tmo=${2:-3000}
out=${3:-$(mktemp -d)}
: "${SECRET_KEY:?set SECRET_KEY in the environment}"
cd "$(git rev-parse --show-toplevel)/integration-tests"
mkdir -p "$out"
script="test:${lane}-secret-key"

find __tests__ -name '*.spec.ts' ! -path '__tests__/flextesa/*' ! -path '__tests__/ledger/*' | sort > "$out/all.txt"
: > "$out/done.txt"; : > "$out/failed.txt"

collect() { # $1 = log: record every file that printed a result line (pass, skip or fail)
  grep -o -E '^ [✓❯↓×] \|integration-tests\| __tests__/[^ ]+\.spec\.ts' "$1" | sed -E 's/.*\| //' >> "$out/done.txt"
  grep -E '^ FAIL ' "$1" | sed -E 's/^ FAIL +\|integration-tests\| ([^ ]+\.spec\.ts).*/\1/' >> "$out/failed.txt"
}

round=0
while :; do
  sort -u "$out/done.txt" -o "$out/done.txt"
  comm -23 "$out/all.txt" "$out/done.txt" > "$out/remaining.txt"
  [ -s "$out/remaining.txt" ] || break
  round=$((round + 1))
  [ "$round" -le 6 ] || { echo "giving up after 6 rounds; $(wc -l < "$out/remaining.txt") files never reported"; break; }
  before=$(wc -l < "$out/done.txt")
  echo "round $round: $(wc -l < "$out/remaining.txt") files remaining"
  timeout "$tmo" npm run "$script" -- $(tr '\n' ' ' < "$out/remaining.txt") > "$out/round-$round.log" 2>&1
  echo "round $round vitest exit=$? (124 = round timeout)"
  collect "$out/round-$round.log"
  sort -u "$out/done.txt" -o "$out/done.txt"
  [ "$(wc -l < "$out/done.txt")" -gt "$before" ] || { echo "no progress in round $round; stopping"; break; }
done

sort -u "$out/failed.txt" -o "$out/failed.txt"
if [ -s "$out/failed.txt" ]; then
  echo "re-running $(wc -l < "$out/failed.txt") failed file(s) alone"
  : > "$out/still_failed.txt"
  while read -r f; do
    timeout 900 npm run "$script" -- "$f" > "$out/retry-$(basename "$f").log" 2>&1 || echo "$f" >> "$out/still_failed.txt"
  done < "$out/failed.txt"
fi

echo "== summary =="
echo "spec files: $(wc -l < "$out/all.txt")  reported: $(comm -12 "$out/all.txt" "$out/done.txt" | wc -l)  failed once: $(wc -l < "$out/failed.txt")  still failing after retry: $( [ -f "$out/still_failed.txt" ] && wc -l < "$out/still_failed.txt" || echo 0)"
comm -23 "$out/all.txt" "$out/done.txt" | sed 's/^/never reported: /'
[ -f "$out/still_failed.txt" ] && sed 's/^/STILL FAILING: /' "$out/still_failed.txt"
echo "logs: $out"
[ ! -s "$out/still_failed.txt" ] 2>/dev/null
