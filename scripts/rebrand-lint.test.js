const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const { scanForRebrandLeftovers, PATTERNS } = require('./rebrand-lint.js');

function withTempRepo(fn) {
  const root = mkdtempSync(join(os.tmpdir(), 'rebrand-lint-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('scanForRebrandLeftovers flags an unreviewed ecadlabs mention', () => {
  withTempRepo((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'file.ts'), "// see https://github.com/ecadlabs/whatever\n");

    const { violations, allowed } = scanForRebrandLeftovers({
      rootDir: root,
      files: ['src/file.ts'],
      patterns: PATTERNS,
      allowlist: [],
    });

    assert.equal(violations.length, 1);
    assert.equal(violations[0].patternId, 'ecadlabs');
    assert.equal(violations[0].file, 'src/file.ts');
    assert.equal(violations[0].line, 1);
    assert.equal(allowed.length, 0);
  });
});

test('scanForRebrandLeftovers excludes matches covered by the allowlist', () => {
  withTempRepo((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'file.ts'), "// see https://github.com/ecadlabs/whatever\n");

    const { violations, allowed } = scanForRebrandLeftovers({
      rootDir: root,
      files: ['src/file.ts'],
      patterns: PATTERNS,
      allowlist: [
        {
          pattern: 'ecadlabs',
          file: 'src/*.ts',
          reason: 'test fixture',
          matcher: { test: (p) => p === 'src/file.ts' },
        },
      ],
    });

    assert.equal(violations.length, 0);
    assert.equal(allowed.length, 1);
    assert.equal(allowed[0].reason, 'test fixture');
  });
});

test('scanForRebrandLeftovers supports a wildcard "*" pattern for whole-file exceptions', () => {
  withTempRepo((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'CLAUDE-like.md'),
      'This project is a fork of Taquito, formerly under ecadlabs, see @taquito/rpc and TAQUITO_FOO.\n'
    );

    const { violations, allowed } = scanForRebrandLeftovers({
      rootDir: root,
      files: ['src/CLAUDE-like.md'],
      patterns: PATTERNS,
      allowlist: [
        {
          pattern: '*',
          file: 'src/CLAUDE-like.md',
          reason: 'meta doc explaining the rename itself',
          matcher: { test: (p) => p === 'src/CLAUDE-like.md' },
        },
      ],
    });

    assert.equal(violations.length, 0);
    assert.ok(allowed.length > 0);
    assert.ok(allowed.every((finding) => finding.reason === 'meta doc explaining the rename itself'));
  });
});

test('scanForRebrandLeftovers reports allowlist entries that matched nothing', () => {
  withTempRepo((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'file.ts'), 'export const x = 1;\n');

    const staleEntry = {
      pattern: 'ecadlabs',
      file: 'src/*.ts',
      reason: 'no longer matches anything',
      matcher: { test: () => false },
    };

    const { unusedAllowlistEntries } = scanForRebrandLeftovers({
      rootDir: root,
      files: ['src/file.ts'],
      patterns: PATTERNS,
      allowlist: [staleEntry],
    });

    assert.equal(unusedAllowlistEntries.length, 1);
    assert.equal(unusedAllowlistEntries[0], staleEntry);
  });
});

test('scanForRebrandLeftovers finds all known pattern categories, including compound Taquito identifiers', () => {
  withTempRepo((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'file.ts'),
      [
        "// ecadlabs mention",
        "// see https://taquito.io/docs",
        "import x from '@taquito/rpc';",
        "const enabled = process.env.TAQUITO_HTTP_TRACE;",
        'class TaquitoError extends Error {}',
        'const taquitoCore = 1;',
      ].join('\n')
    );

    const { violations } = scanForRebrandLeftovers({
      rootDir: root,
      files: ['src/file.ts'],
      patterns: PATTERNS,
      allowlist: [],
    });

    const foundIds = new Set(violations.map((v) => v.patternId));
    assert.deepEqual(
      foundIds,
      new Set(['ecadlabs', 'taquito-io', 'taquito-scope', 'taquito-env-prefix', 'taquito-identifier'])
    );

    const identifierMatches = violations
      .filter((v) => v.patternId === 'taquito-identifier')
      .map((v) => v.match);
    assert.deepEqual(identifierMatches, ['TaquitoError', 'taquitoCore']);
  });
});

test('taquito-identifier pattern does not flag the bare word "Taquito" in prose', () => {
  withTempRepo((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'file.md'), 'octez.js is a fork of Taquito.\n');

    const { violations } = scanForRebrandLeftovers({
      rootDir: root,
      files: ['src/file.md'],
      patterns: PATTERNS,
      allowlist: [],
    });

    assert.equal(violations.length, 0);
  });
});

test('scanForRebrandLeftovers runs against the real repo and allowlist without throwing', () => {
  // Deliberately does NOT assert violations.length === 0: this repo currently
  // has real, not-yet-reviewed rebrand leftovers (that's the point of widening
  // the linter's scope), and this test suite runs in CI via `npm run
  // test:scripts` -- asserting a clean repo here would silently turn this into
  // a CI gate, which is explicitly not wanted yet. Run `npm run check:rebrand`
  // by hand to see current findings.
  const { violations, allowed, unusedAllowlistEntries } = scanForRebrandLeftovers();

  assert.ok(Array.isArray(violations));
  assert.ok(Array.isArray(allowed));
  assert.ok(Array.isArray(unusedAllowlistEntries));
});
