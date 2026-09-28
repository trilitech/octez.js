const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const { getPublishablePackageDirs, checkPackage, fixPackage } = require('./prepare-package-release.js');

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function makeFixture() {
  const root = mkdtempSync(join(os.tmpdir(), 'prepare-package-release-'));

  writeFileSync(join(root, 'LICENSE'), 'Apache License 2.0 text\n');
  writeFileSync(join(root, 'NOTICE'), 'octez.js NOTICE text\n');

  mkdirSync(join(root, 'packages', 'octez.js-core'), { recursive: true });
  writeJson(join(root, 'packages', 'octez.js-core', 'package.json'), {
    name: '@tezos-x/octez.js-core',
    version: '25.0.0',
    files: ['dist'],
  });

  mkdirSync(join(root, 'packages', 'octez.js-michel-codec', 'pack-test-tool'), { recursive: true });
  writeJson(join(root, 'packages', 'octez.js-michel-codec', 'pack-test-tool', 'package.json'), {
    name: 'pack-test-tool',
    private: true,
  });

  mkdirSync(join(root, 'packages', 'octez.js-no-files-field'), { recursive: true });
  writeJson(join(root, 'packages', 'octez.js-no-files-field', 'package.json'), {
    name: '@tezos-x/octez.js-no-files-field',
    version: '25.0.0',
  });

  return root;
}

test('getPublishablePackageDirs skips private packages and nested dirs', () => {
  const root = makeFixture();

  try {
    const dirs = getPublishablePackageDirs(root).sort();
    assert.deepEqual(dirs, [
      join(root, 'packages', 'octez.js-core'),
      join(root, 'packages', 'octez.js-no-files-field'),
    ].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkPackage reports missing LICENSE/NOTICE and missing files entries', () => {
  const root = makeFixture();

  try {
    const dir = join(root, 'packages', 'octez.js-core');
    const result = checkPackage(root, dir);

    assert.equal(result.name, '@tezos-x/octez.js-core');
    assert.deepEqual(result.problems, [
      'missing LICENSE',
      '"files" in package.json does not list LICENSE',
      'missing NOTICE',
      '"files" in package.json does not list NOTICE',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixPackage copies LICENSE/NOTICE and updates files, then checkPackage passes', () => {
  const root = makeFixture();

  try {
    const dir = join(root, 'packages', 'octez.js-core');
    fixPackage(root, dir);

    assert.equal(readFileSync(join(dir, 'LICENSE'), 'utf8'), 'Apache License 2.0 text\n');
    assert.equal(readFileSync(join(dir, 'NOTICE'), 'utf8'), 'octez.js NOTICE text\n');

    const pkg = readJson(join(dir, 'package.json'));
    assert.deepEqual(pkg.files, ['dist', 'LICENSE', 'NOTICE']);

    const result = checkPackage(root, dir);
    assert.deepEqual(result.problems, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixPackage is idempotent and does not duplicate files entries', () => {
  const root = makeFixture();

  try {
    const dir = join(root, 'packages', 'octez.js-core');
    fixPackage(root, dir);
    fixPackage(root, dir);

    const pkg = readJson(join(dir, 'package.json'));
    assert.deepEqual(pkg.files, ['dist', 'LICENSE', 'NOTICE']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkPackage flags a package with no "files" array at all', () => {
  const root = makeFixture();

  try {
    const dir = join(root, 'packages', 'octez.js-no-files-field');
    const result = checkPackage(root, dir);

    assert.deepEqual(result.problems, [
      'missing LICENSE',
      '"files" in package.json does not list LICENSE',
      'missing NOTICE',
      '"files" in package.json does not list NOTICE',
      'package.json has no "files" array (publishes everything unfiltered)',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixPackage seeds "files" with "dist" when the package had none, instead of dropping it', () => {
  const root = makeFixture();

  try {
    const dir = join(root, 'packages', 'octez.js-no-files-field');
    fixPackage(root, dir);

    const pkg = readJson(join(dir, 'package.json'));
    assert.deepEqual(pkg.files, ['dist', 'LICENSE', 'NOTICE']);

    const result = checkPackage(root, dir);
    assert.deepEqual(result.problems, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
