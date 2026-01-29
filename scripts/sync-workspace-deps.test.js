const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const { syncWorkspaceDeps } = require('./sync-workspace-deps.js');

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('syncWorkspaceDeps only rewrites versions for workspace packages', () => {
  const root = mkdtempSync(join(os.tmpdir(), 'sync-workspace-deps-'));

  try {
    mkdirSync(join(root, 'packages', 'octez.js'), { recursive: true });
    mkdirSync(join(root, 'packages', 'octez.js-core'), { recursive: true });
    mkdirSync(join(root, 'packages', 'octez.js-sapling'), { recursive: true });
    mkdirSync(join(root, 'integration-tests'), { recursive: true });

    writeJson(join(root, 'package.json'), {
      name: 'octez.js-monorepo',
      version: '24.2.0',
      workspaces: ['packages/*', 'integration-tests'],
    });

    writeJson(join(root, 'packages', 'octez.js', 'package.json'), {
      name: '@tezos-x/octez.js',
      version: '24.2.0',
      dependencies: {
        '@tezos-x/octez.js-core': '^24.2.0',
      },
    });

    writeJson(join(root, 'packages', 'octez.js-core', 'package.json'), {
      name: '@tezos-x/octez.js-core',
      version: '24.2.0',
    });

    writeJson(join(root, 'packages', 'octez.js-sapling', 'package.json'), {
      name: '@tezos-x/octez.js-sapling',
      version: '24.2.0',
      dependencies: {
        '@tezos-x/octez.js-core': '^24.2.0',
        '@tezos-x/octez.js-sapling-wasm': '0.2.0',
      },
    });

    writeJson(join(root, 'integration-tests', 'package.json'), {
      name: 'integration-tests',
      version: '24.2.0',
      dependencies: {
        '@tezos-x/octez.js': '^24.2.0',
      },
    });

    syncWorkspaceDeps(root, '24.3.0-beta.3');

    assert.equal(readJson(join(root, 'package.json')).version, '24.3.0-beta.3');
    assert.equal(
      readJson(join(root, 'packages', 'octez.js', 'package.json')).dependencies['@tezos-x/octez.js-core'],
      '^24.3.0-beta.3'
    );
    assert.equal(
      readJson(join(root, 'packages', 'octez.js-sapling', 'package.json')).dependencies['@tezos-x/octez.js-core'],
      '^24.3.0-beta.3'
    );
    assert.equal(
      readJson(join(root, 'packages', 'octez.js-sapling', 'package.json')).dependencies['@tezos-x/octez.js-sapling-wasm'],
      '0.2.0'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
