#!/usr/bin/env bash
# Final sweep for the protocol-rotation skill.
#
# Usage: sweep.sh <old-token-regex> [allowlist-file]
#
#   <old-token-regex>  ERE, matched case-insensitively against tracked files.
#                      Built by the skill from the OLD protocol (name, <name>net,
#                      hash, 7-char hash prefix, number forms, chain id).
#   [allowlist-file]   One ERE per line, matched against "path:line:text". Lines
#                      starting with '#' are comments. A hit matching any entry is
#                      an *intentional keep* and is printed in the KEPT section.
#
# Output (stdout): three sections, each line "path:line:text"
#   == UNEXPLAINED ==   hits that are neither allowlisted nor out of scope  (must be 0)
#   == KEPT ==          allowlisted hits (the skill copies these into the report)
#   == OUT OF SCOPE ==  hits in places the skill never edits (non-next docs,
#                       lockfiles, .github/workflows) - reported, not fixed
# Exit status: 0 when UNEXPLAINED is empty, 1 otherwise.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <old-token-regex> [allowlist-file]" >&2
  exit 2
fi
tokens=$1
allow=${2:-}

cd "$(git rev-parse --show-toplevel)"

hits=$(git grep -I -n -i -E "$tokens" -- . ':!package-lock.json' || true)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf '%s\n' "$hits" | grep -v '^$' > "$tmp/all" || true

# Split: out of scope (never edited by the skill) vs in scope.
awk -v oos="$tmp/out_of_scope" -v ins="$tmp/in_scope" '
  /^package-lock\.json:/ || /^\.github\/workflows\// || /^website\/versioned_docs/ \
    || (/^website\/src\/content\/docs\// && !/^website\/src\/content\/docs\/next\//) {print > oos; next}
  {print > ins}
' "$tmp/all"
touch "$tmp/out_of_scope" "$tmp/in_scope"

: > "$tmp/kept"
: > "$tmp/unexplained"
if [ -n "$allow" ] && [ -f "$allow" ]; then
  grep -v -E '^\s*(#|$)' "$allow" > "$tmp/allow_re" || true
else
  : > "$tmp/allow_re"
fi
if [ -s "$tmp/allow_re" ]; then
  grep -E -f "$tmp/allow_re" "$tmp/in_scope" > "$tmp/kept" || true
  grep -v -E -f "$tmp/allow_re" "$tmp/in_scope" > "$tmp/unexplained" || true
else
  cp "$tmp/in_scope" "$tmp/unexplained"
fi

echo "== UNEXPLAINED =="; cat "$tmp/unexplained"
echo "== KEPT ==";        cat "$tmp/kept"
echo "== OUT OF SCOPE =="; cat "$tmp/out_of_scope"

[ ! -s "$tmp/unexplained" ]
