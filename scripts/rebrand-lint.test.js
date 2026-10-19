const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const { execFileSync } = require('node:child_process');
const { symlinkSync, rmSync: rm } = require('node:fs');
const { scanForRebrandLeftovers, listTrackedFiles, globToRegExp, PATTERNS } = require('./rebrand-lint.js');

function withTempRepo(fn) {
  const root = mkdtempSync(join(os.tmpdir(), 'rebrand-lint-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('scanForRebrandLeftovers flags ecadinfra hosts and ecad-tezos-* node names', () => {
  withTempRepo((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'file.ts'),
      "const a = 'https://rpc.tezos.ecadinfra.com';\nconst b = 'ecad-tezos-mainnet-1.i.ecadinfra.com';\n"
    );

    const { violations } = scanForRebrandLeftovers({
      rootDir: root,
      files: ['src/file.ts'],
      patterns: PATTERNS,
      allowlist: [],
    });

    assert.deepEqual(
      violations.map((v) => `${v.line}:${v.patternId}`).sort(),
      ['1:ecadinfra', '2:ecad-tezos-node', '2:ecadinfra']
    );
  });
});

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

test('scan does not crash on non-ASCII names, dangling symlinks, directory symlinks or deleted tracked files', () => {
  withTempRepo((root) => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'dir'));
    writeFileSync(join(root, 'café.ts'), "const a = 'taquito.io';\n");
    writeFileSync(join(root, 'gone.ts'), 'x\n');
    symlinkSync('does-not-exist', join(root, 'dangling'));
    symlinkSync('dir', join(root, 'dirlink'));
    execFileSync('git', ['add', '-A'], { cwd: root });
    rm(join(root, 'gone.ts'));

    const files = listTrackedFiles(root);
    assert.ok(files.includes('café.ts'), 'unquoted non-ASCII name is listed');

    const { violations } = scanForRebrandLeftovers({ rootDir: root, files, allowlist: [] });
    assert.deepEqual(violations.map((v) => v.file), ['café.ts']);
  });
});

test('globToRegExp: `*` stays inside one path segment, `**` crosses segments, matches are anchored', () => {
  const m = (glob, file) => globToRegExp(glob).test(file);
  assert.ok(m('NOTICE', 'NOTICE'));
  assert.ok(!m('NOTICE', 'packages/a/NOTICE'), 'must be anchored at the start');
  assert.ok(!m('NOTICE', 'NOTICE.md'), 'must be anchored at the end');
  assert.ok(m('packages/*/NOTICE', 'packages/a/NOTICE'));
  assert.ok(!m('packages/*/NOTICE', 'packages/a/b/NOTICE'), '`*` must not cross `/`');
  assert.ok(m('packages/**/package.json', 'packages/a/b/package.json'));
  assert.ok(m('integration-tests/**', 'integration-tests/x/y.ts'));
  assert.ok(m('a?c.ts', 'abc.ts'));
  assert.ok(!m('a?c.ts', 'a/c.ts'), '`?` must not match `/`');
  assert.ok(!m('a.ts', 'abts'), 'regex metacharacters are escaped');
});

test('TAQUITO_ env pattern needs a word boundary before the prefix', () => {
  const env = PATTERNS.find((p) => p.id === 'taquito-env-prefix');
  assert.equal([...'use TAQUITO_OP_TRACE here'.matchAll(env.regex)].length, 1);
  assert.equal([...'XTAQUITO_OP_TRACE'.matchAll(env.regex)].length, 0);
});

// Runs a copy of the linter in a throwaway git repo (the script resolves the
// repo root from its own location) to test the real CLI contract.
function runCli(files, allowlist = []) {
  return withTempRepo((root) => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'scripts'));
    const fs = require('node:fs');
    fs.copyFileSync(join(__dirname, 'rebrand-lint.js'), join(root, 'scripts', 'rebrand-lint.js'));
    writeFileSync(join(root, 'scripts', 'rebrand-lint.allowlist.json'), JSON.stringify(allowlist));
    for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);
    // Track only the fixtures: the copied linter source itself contains the patterns.
    execFileSync('git', ['add', '--', ...Object.keys(files)], { cwd: root });
    try {
      const stdout = execFileSync('node', ['scripts/rebrand-lint.js'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
      return { status: 0, stdout, stderr: '' };
    } catch (err) {
      return { status: err.status, stdout: String(err.stdout), stderr: String(err.stderr) };
    }
  });
}

test('CLI exits 1 and lists the file when there is an unreviewed leftover', () => {
  const r = runCli({ 'a.ts': "const u = 'https://taquito.io/docs';\n" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a\.ts:1\s+\[taquito-io\]/);
});

test('CLI exits 0 on a clean repo and on an allowlisted leftover', () => {
  assert.equal(runCli({ 'a.ts': 'const x = 1;\n' }).status, 0);
  const allowed = runCli(
    { 'a.ts': "const u = 'https://taquito.io/docs';\n" },
    [{ pattern: 'taquito-io', file: 'a.ts', reason: 'test' }]
  );
  assert.equal(allowed.status, 0);
});

test('CLI does not fail on an allowlist entry that matches nothing (stale)', () => {
  const r = runCli({ 'a.ts': 'const x = 1;\n' }, [{ pattern: 'taquito-io', file: 'gone/**', reason: 'test' }]);
  assert.equal(r.status, 0);
});
