#!/usr/bin/env python3
"""Re-record the first sample block of next/rpc_nodes_integration_test.mdx from a real run.

Usage:
  SECRET_KEY=... npm run test:<newnet>-secret-key -- __tests__/rpc/nodes.spec.ts --reporter=verbose > run.txt
  python3 skills/protocol-rotation/regen-rpc-sample.py run.txt

Only the first fenced block (the "all endpoints accessible" sample) is replaced; the
second block (failing example) is left alone. The header keeps the `<rpc-url>` placeholder
so the sample doesn't claim to come from one host. Prints the number of lines written.
"""
import re
import subprocess
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel']).decode().strip()
path = f'{root}/website/src/content/docs/next/rpc_nodes_integration_test.mdx'

lines = []
for l in open(sys.argv[1]):
    m = re.match(r'\s*✓ \|integration-tests\| .*? > (Verify .*?)\s+(\d+)ms\s*$', l)
    if m:
        lines.append(f'    ✓ {m.group(1)} ({m.group(2)} ms)')
if not lines:
    sys.exit('no passing test lines found: run vitest with --reporter=verbose')

doc = open(path).read().split('\n')
start = next(i for i, l in enumerate(doc) if l == '```')
end = next(i for i in range(start + 1, len(doc)) if doc[i] == '```')
assert doc[start + 1].lstrip().startswith('Test calling all methods'), 'unexpected sample layout'
doc[start + 2:end] = lines
open(path, 'w').write('\n'.join(doc))
print(f'wrote {len(lines)} lines into {path}')
